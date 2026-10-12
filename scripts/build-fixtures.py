"""Write tests/fixtures/v1.json, the bodies the local fake serves, from fern/openapi.json.

Each SDK operation's success schema is instantiated with its required properties (first enum value,
one array element, format-shaped strings); the Error schema gives the failure body. A success body
that is a tagged union also carries `variants`, one body per discriminator value. tests/fake-v1.mjs
mutates these for the cases the tests assert on.
"""
import json
import runpy
from pathlib import Path

root = Path(__file__).resolve().parents[1]
tools = runpy.run_path(str(root / 'scripts/prepare-openapi.py'))
doc = json.loads((root / 'fern/openapi.json').read_text())
schemas = doc['components']['schemas']

STRINGS = {
    'date-time': '2026-09-25T20:21:25Z',
    'date': '2026-09-25',
    'uri': 'https://arcmira.com/x',
    'url': 'https://arcmira.com/x',
    'email': 'hi@arcmira.com',
    'uuid': '2f2b4a3e-8d1c-4c8e-9a0f-1b2c3d4e5f60',
}


def deref(schema):
    if schema and '$ref' in schema:
        return schemas[schema['$ref'].removeprefix('#/components/schemas/')]
    return schema


def instance(raw, depth=0):
    schema = deref(raw)
    if not schema or depth > 12:
        return None
    if 'const' in schema:
        return schema['const']
    if 'default' in schema:
        return schema['default']
    if 'enum' in schema:
        return schema['enum'][0]
    if 'allOf' in schema:
        merged = {}
        for part in schema['allOf']:
            merged.update(instance(part, depth + 1) or {})
        return merged
    options = schema.get('oneOf') or schema.get('anyOf')
    if options:
        first = next((option for option in options if (deref(option) or {}).get('type') != 'null'), options[0])
        return instance(first, depth + 1)
    types = schema['type'] if isinstance(schema.get('type'), list) else [schema.get('type')]
    kind = next((t for t in types if t and t != 'null'), 'object' if 'properties' in schema else 'array' if 'items' in schema else 'null')
    if kind == 'boolean':
        return True
    if kind in ('integer', 'number'):
        return schema['minimum'] if isinstance(schema.get('minimum'), (int, float)) else 1
    if kind == 'string':
        pattern = schema.get('pattern', '')
        if schema.get('format') in STRINGS:
            return STRINGS[schema['format']]
        if '{11}' in pattern:
            return 'dQw4w9WgXcQ'
        if 'UC' in pattern:
            return 'UC-DRzaGnL_vtBUpCFH5M0tg'
        return 'x'
    if kind == 'array':
        return [instance(schema.get('items', {}), depth + 1)]
    if kind == 'object':
        properties = schema.get('properties', {})
        return {name: instance(properties[name], depth + 1) for name in schema.get('required', []) if name in properties}
    return None


def build():
    fixtures = {}
    for methods in doc['paths'].values():
        for method, op in methods.items():
            if method not in tools['METHODS'] or op['operationId'] in tools['EXCLUDED']:
                continue
            responses = {}
            for code, response in op['responses'].items():
                if not code.startswith('2'):
                    continue
                schema = response.get('content', {}).get('application/json', {}).get('schema')
                entry = {'status': int(code), 'body': instance(schema) if schema else None}
                mapping = (schema or {}).get('discriminator', {}).get('mapping')
                if mapping:
                    entry['variants'] = {tag: {'status': int(code), 'body': instance({'$ref': ref})} for tag, ref in mapping.items()}
                responses[code] = entry
            if not responses:
                raise ValueError(f'{op["operationId"]} has no success response')
            fixtures[op['operationId']] = {**next(iter(responses.values())), 'responses': responses}
    fixtures['error'] = instance(schemas['Error'])
    return fixtures


if __name__ == '__main__':
    fixtures = build()
    (root / 'tests/fixtures/v1.json').write_text(json.dumps(fixtures, indent=2, ensure_ascii=False) + '\n')
    print(f'wrote tests/fixtures/v1.json: {len(fixtures) - 1} operations')
