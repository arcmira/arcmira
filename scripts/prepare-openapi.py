"""Build Fern's public generation input without changing the HTTP contract.

fern/method-names.json names the SDK group and method of every operation, keyed by operationId.
An operation it does not name, or a name for an operation the document lacks, fails the build,
so a new route gets an SDK name on purpose.
"""
import copy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
METHODS = {'get', 'put', 'post', 'patch', 'delete'}
# Account bootstrap and the document itself are not SDK calls.
EXCLUDED = {'get_openapi_document', 'create_signup', 'verify_signup'}
# The product noun is transcripts, so the Job a Premium read returns is a TranscriptJob.
TYPE_NAMES = {
    'TranscriptionJob': 'TranscriptJob',
    'TranscriptionListResponse': 'TranscriptRequestListResponse',
}
# The one array property of each paged success body.
COLLECTIONS = {'mentions', 'recommendations', 'alerts', 'episodes', 'requests'}


def resolve(document, schema):
    while '$ref' in schema:
        ref = schema['$ref']
        if not ref.startswith('#/'):
            raise ValueError(f'External schema reference: {ref}')
        schema = document
        for part in ref[2:].split('/'):
            schema = schema[part.replace('~1', '/').replace('~0', '~')]
    return schema


def collection(document, schema):
    props = resolve(document, schema).get('properties', {})
    arrays = [key for key, value in props.items() if resolve(document, value).get('type') == 'array']
    if len(arrays) != 1 or arrays[0] not in COLLECTIONS:
        raise ValueError(f'Unknown or ambiguous cursor collection: {arrays}')
    return arrays[0]


def walk(value, visit):
    if isinstance(value, dict):
        visit(value)
        for child in value.values():
            walk(child, visit)
    elif isinstance(value, list):
        for child in value:
            walk(child, visit)


def prepare(document, names):
    doc = copy.deepcopy(document)
    schemas = doc['components']['schemas']
    for source, target in TYPE_NAMES.items():
        schemas[target] = schemas.pop(source)

    def rename_ref(value):
        source = value.get('$ref', '').removeprefix('#/components/schemas/')
        if source in TYPE_NAMES:
            value['$ref'] = '#/components/schemas/' + TYPE_NAMES[source]

    def collapse_described_ref(value):
        # Fern inlines an allOf of one $ref plus a description; a bare $ref keeps one shared type.
        parts = value.get('allOf')
        if parts and sum('$ref' in part for part in parts) == 1 and all('$ref' in part or set(part) == {'description'} for part in parts):
            del value['allOf']
            value['$ref'] = next(part['$ref'] for part in parts if '$ref' in part)

    walk(doc, rename_ref)
    walk(doc, collapse_described_ref)
    # Fern 5.131.1 loses inherited example fields in this object intersection. The flat object stays
    # nullable: resolve answers suggested: null whenever it has a best match.
    suggestion = schemas['ResolveSuggestion']
    members = [resolve(doc, part) for part in suggestion.pop('allOf')]
    suggestion.update(type=['object', 'null'], properties={}, required=[])
    for member in members:
        suggestion['properties'].update(member['properties'])
        suggestion['required'].extend(member.get('required', []))
    doc['servers'] = [{'url': 'https://api.arcmira.com'}]
    doc['components']['securitySchemes']['bearerAuth']['x-fern-bearer'] = {'name': 'apiKey', 'env': 'ARCMIRA_API_KEY'}

    unnamed = []
    for path in list(doc['paths']):
        methods = doc['paths'][path]
        for method in [m for m in methods if m in METHODS]:
            op = methods[method]
            operation_id = op['operationId']
            if operation_id in EXCLUDED:
                del methods[method]
                continue
            if operation_id not in names:
                unnamed.append(operation_id)
                continue
            op['x-fern-sdk-group-name'] = names[operation_id]['group']
            op['x-fern-sdk-method-name'] = names[operation_id]['method']
            op['parameters'] = [p for p in op.get('parameters', []) if not (p.get('in') == 'query' and p['name'] == 'src')]
            body = resolve(doc, op.get('requestBody', {})).get('content', {}).get('application/json', {}).get('schema', {})
            # A deprecated body alias collides with its canonical name after camelCase normalization.
            for name in [name for name, prop in body.get('properties', {}).items() if prop.get('deprecated')]:
                del body['properties'][name]
            if operation_id == 'submit_feedback':
                # type and query are also read from the query string as a curl convenience; the SDKs send the body.
                op['parameters'] = [p for p in op['parameters'] if not (p.get('in') == 'query' and p['name'] in {'type', 'query'})]
                body['required'] = sorted(set(body.get('required', [])) | {'type'})
            responses = []
            for code, response in op.get('responses', {}).items():
                if code.startswith('2'):
                    schema = resolve(doc, response).get('content', {}).get('application/json', {}).get('schema')
                    for member in (schema or {}).get('oneOf', [schema] if schema is not None else []):
                        if member not in responses:
                            responses.append(member)
            if len(responses) > 1:
                states = {}
                for schema in responses:
                    state = resolve(doc, schema).get('properties', {}).get('state', {}).get('enum', [])
                    if len(state) != 1 or state[0] in states or '$ref' not in schema:
                        raise ValueError(f'Cannot discriminate success schemas for {method} {path}')
                    states[state[0]] = schema['$ref']
                union_name = 'TranscriptResult' if operation_id == 'get_transcript' else operation_id + 'Result'
                schemas[union_name] = {'oneOf': responses, 'discriminator': {'propertyName': 'state', 'mapping': states}}
                for code, response in op['responses'].items():
                    if code.startswith('2'):
                        response['content']['application/json']['schema'] = {'$ref': '#/components/schemas/' + union_name}
            if method == 'get' and any(p.get('name') == 'cursor' and p.get('in') == 'query' for p in op['parameters']):
                if len(responses) != 1:
                    raise ValueError(f'Cursor operation lacks a single collection response: {path}')
                items = collection(doc, responses[0])
                if 'next_cursor' not in resolve(doc, responses[0]).get('properties', {}):
                    raise ValueError(f'Cursor operation lacks next_cursor: {path}')
                op['x-fern-pagination'] = {'cursor': '$request.cursor', 'next_cursor': '$response.next_cursor', 'results': '$response.' + items}
        if not any(m in METHODS for m in methods):
            del doc['paths'][path]
    if unnamed:
        raise ValueError(f'fern/method-names.json names no SDK method for: {", ".join(unnamed)}')
    present = {op['operationId'] for methods in document['paths'].values() for m, op in methods.items() if m in METHODS}
    stale = sorted(set(names) - present)
    if stale:
        raise ValueError(f'fern/method-names.json names operations the document no longer has: {", ".join(stale)}')
    return doc


if __name__ == '__main__':
    doc = prepare(json.loads((ROOT / 'fern/openapi.json').read_text()), json.loads((ROOT / 'fern/method-names.json').read_text()))
    (ROOT / 'fern/openapi.sdk.json').write_text(json.dumps(doc, indent=2) + '\n')
