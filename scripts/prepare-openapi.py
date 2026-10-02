"""Build Fern's public generation input without changing the HTTP contract."""
import copy
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


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
    if len(arrays) != 1 or arrays[0] not in {'data', 'requests', 'episodes', 'items'}:
        raise ValueError(f'Unknown or ambiguous cursor collection: {arrays}')
    return arrays[0]


def prepare(document, names):
    doc = copy.deepcopy(document)
    for path in ('/v1/openapi.json', '/v1/signups', '/v1/signups/verify', '/v1/search'):
        del doc['paths'][path]
    type_names = {
        'TranscriptionJob': 'TranscriptJob',
        'TranscriptionSubmitResponse': 'TranscriptRequestSubmitResponse',
        'TranscriptionListResponse': 'TranscriptRequestListResponse',
    }
    schemas = doc['components']['schemas']
    for source, target in type_names.items():
        schemas[target] = schemas.pop(source)
    def rename_refs(value):
        if isinstance(value, dict):
            ref = value.get('$ref', '')
            source = ref.removeprefix('#/components/schemas/')
            if source in type_names:
                value['$ref'] = '#/components/schemas/' + type_names[source]
            for child in value.values(): rename_refs(child)
        elif isinstance(value, list):
            for child in value: rename_refs(child)
    rename_refs(doc)
    def collapse_job_refs(value):
        # Fern inlines an allOf of the Job $ref plus a description; a bare $ref keeps one shared Job type.
        if isinstance(value, dict):
            parts = value.get('allOf')
            if parts and sum('$ref' in part for part in parts) == 1 and all('$ref' in part or set(part) == {'description'} for part in parts) and any(part.get('$ref') == '#/components/schemas/TranscriptJob' for part in parts):
                del value['allOf']
                value['$ref'] = next(part['$ref'] for part in parts if '$ref' in part)
            for child in value.values(): collapse_job_refs(child)
        elif isinstance(value, list):
            for child in value: collapse_job_refs(child)
    collapse_job_refs(doc)
    # Fern 5.131.1 loses inherited example fields in this object intersection.
    suggestion = doc['components']['schemas']['ResolveSuggestion']
    members = [resolve(doc, part) for part in suggestion.pop('allOf')]
    suggestion.update(type='object', properties={}, required=[])
    for member in members:
        suggestion['properties'].update(member['properties'])
        suggestion['required'].extend(member.get('required', []))
    doc['servers'] = [{'url': 'https://api.arcmira.com'}]
    doc['components']['securitySchemes']['bearerAuth']['x-fern-bearer'] = {'name': 'apiKey', 'env': 'ARCMIRA_API_KEY'}
    special = {
        'quote_transcription': ('transcripts', 'quote'),
        'submit_transcription': ('transcripts', 'request'),
        'get_transcription': ('transcripts', 'status'),
        'list_transcriptions': ('transcripts', 'listRequests'),
    }
    for path, methods in doc['paths'].items():
        for method, op in methods.items():
            if method not in {'get', 'post', 'put', 'patch', 'delete'}:
                continue
            op['parameters'] = [p for p in op.get('parameters', []) if not (p.get('in') == 'query' and p['name'] == 'src')]
            key = method + ' ' + re.sub(r'\{[^}]+\}', '{}', path)
            if op.get('operationId') in special:
                group, name = special[op['operationId']]
                op['x-fern-sdk-group-name'] = group
                op['x-fern-sdk-method-name'] = name
            elif key in names:
                op['x-fern-sdk-group-name'] = names[key]['group']
                op['x-fern-sdk-method-name'] = names[key]['method']
            body = resolve(doc, op.get('requestBody', {})).get('content', {}).get('application/json', {}).get('schema', {})
            # A deprecated body alias (videoId beside video_id) collides with its canonical name after camelCase normalization.
            for name in [name for name, prop in body.get('properties', {}).items() if prop.get('deprecated')]:
                del body['properties'][name]
            if path == '/v1/feedback' and method == 'post':
                # Legacy query alternatives collide with the established body API.
                op['parameters'] = [p for p in op.get('parameters', []) if not (p.get('in') == 'query' and p['name'] in {'type', 'query'})]
                body = op['requestBody']['content']['application/json']['schema']
                body['required'] = sorted(set(body.get('required', [])) | {'type', 'query'})
            responses = []
            for code, response in op.get('responses', {}).items():
                if code.startswith('2'):
                    response = resolve(doc, response)
                    schema = response.get('content', {}).get('application/json', {}).get('schema')
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
                union_name = 'TranscriptResult' if op['operationId'] == 'get_transcript' else op['operationId'] + 'Result'
                doc['components']['schemas'][union_name] = {'oneOf': responses, 'discriminator': {'propertyName': 'state', 'mapping': states}}
                for code, response in op['responses'].items():
                    if code.startswith('2'):
                        response['content']['application/json']['schema'] = {'$ref': '#/components/schemas/' + union_name}
            if method == 'get' and any(p.get('name') == 'cursor' and p.get('in') == 'query' for p in op.get('parameters', [])):
                if len(responses) != 1:
                    raise ValueError(f'Cursor operation lacks a single collection response: {path}')
                items = collection(doc, responses[0])
                if 'next_cursor' not in resolve(doc, responses[0]).get('properties', {}):
                    raise ValueError(f'Cursor operation lacks next_cursor: {path}')
                op['x-fern-pagination'] = {'cursor': '$request.cursor', 'next_cursor': '$response.next_cursor', 'results': '$response.' + items}
    return doc


if __name__ == '__main__':
    doc = prepare(json.loads((ROOT / 'fern/openapi.json').read_text()), json.loads((ROOT / 'fern/method-names.json').read_text()))
    (ROOT / 'fern/openapi.sdk.json').write_text(json.dumps(doc, indent=2) + '\n')
