import copy
import json
import runpy
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOLS = runpy.run_path(str(ROOT / 'scripts/prepare-openapi.py'))
DOCUMENT = json.loads((ROOT / 'fern/openapi.json').read_text())
NAMES = json.loads((ROOT / 'fern/method-names.json').read_text())
METHODS = {'get', 'put', 'post', 'patch', 'delete'}


def operations(doc):
    for path, methods in doc['paths'].items():
        for method, op in methods.items():
            if method in METHODS:
                yield path, method, op


def body_schema(doc, op):
    request = TOOLS['resolve'](doc, op['requestBody'])
    return TOOLS['resolve'](doc, request['content']['application/json']['schema'])


class GenerationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.prepared = TOOLS['prepare'](DOCUMENT, NAMES)

    def test_unknown_and_ambiguous_cursor_collections_fail(self):
        for props in ({'mystery': {'type': 'array'}}, {'requests': {'type': 'array'}, 'episodes': {'type': 'array'}}):
            with self.assertRaisesRegex(ValueError, 'Unknown or ambiguous'):
                TOOLS['collection']({}, {'properties': props})

    def test_prepare_leaves_the_input_document_unchanged(self):
        before = copy.deepcopy(DOCUMENT)
        TOOLS['prepare'](DOCUMENT, NAMES)
        self.assertEqual(DOCUMENT, before)

    def test_transcript_result_discriminates_ready_and_pending(self):
        union = self.prepared['components']['schemas']['TranscriptResult']
        self.assertEqual(union['discriminator']['propertyName'], 'state')
        self.assertEqual(set(union['discriminator']['mapping']), {'ready', 'pending'})
        responses = self.prepared['paths']['/v1/transcripts/{video_id}']['get']['responses']
        for code in ('200', '202'):
            self.assertEqual(responses[code]['content']['application/json']['schema'], {'$ref': '#/components/schemas/TranscriptResult'})

    def test_cursor_pagination_reads_the_named_collection(self):
        expected = {
            '/v1/mentions': 'mentions',
            '/v1/recommendations': 'recommendations',
            '/v1/channels/{channel_id}/videos': 'episodes',
            '/v1/transcriptions': 'requests',
        }
        paged = {path: op['x-fern-pagination']['results'] for path, _, op in operations(self.prepared) if 'x-fern-pagination' in op}
        self.assertEqual(paged, {path: '$response.' + items for path, items in expected.items()})
        for path in expected:
            pagination = self.prepared['paths'][path]['get']['x-fern-pagination']
            self.assertEqual((pagination['cursor'], pagination['next_cursor']), ('$request.cursor', '$response.next_cursor'))

    def test_every_operation_gets_its_name_from_method_names(self):
        for path, method, op in operations(self.prepared):
            name = NAMES[op['operationId']]
            self.assertEqual((op['x-fern-sdk-group-name'], op['x-fern-sdk-method-name']), (name['group'], name['method']), f'{method} {path}')
        search = self.prepared['paths']['/v1/search']['get']
        self.assertEqual((search['x-fern-sdk-group-name'], search['x-fern-sdk-method-name']), (['transcripts'], 'search'))

    def test_an_operation_without_a_name_fails(self):
        names = {key: value for key, value in NAMES.items() if key != 'list_mentions'}
        with self.assertRaisesRegex(ValueError, 'names no SDK method for: list_mentions'):
            TOOLS['prepare'](DOCUMENT, names)

    def test_a_name_for_a_missing_operation_fails(self):
        names = {**NAMES, 'submit_transcription': {'group': ['transcripts'], 'method': 'request'}}
        with self.assertRaisesRegex(ValueError, 'no longer has: submit_transcription'):
            TOOLS['prepare'](DOCUMENT, names)
        doc = copy.deepcopy(DOCUMENT)
        del doc['paths']['/v1/integrations/slack']
        with self.assertRaisesRegex(ValueError, 'no longer has: list_slack_integrations'):
            TOOLS['prepare'](doc, NAMES)

    def test_excluded_operations_are_absent(self):
        present = {op['operationId'] for _, _, op in operations(DOCUMENT)}
        self.assertLessEqual(TOOLS['EXCLUDED'], present)
        prepared = {op['operationId'] for _, _, op in operations(self.prepared)}
        self.assertFalse(TOOLS['EXCLUDED'] & prepared)
        self.assertEqual(prepared, set(NAMES))
        for path in ('/v1/openapi.json', '/v1/signups', '/v1/signups/verify'):
            self.assertNotIn(path, self.prepared['paths'])

    def test_feedback_body_requires_type_and_query_is_body_only(self):
        op = self.prepared['paths']['/v1/feedback']['post']
        self.assertIn('type', body_schema(self.prepared, op)['required'])
        self.assertFalse([p['name'] for p in op['parameters'] if p.get('in') == 'query' and p['name'] in {'type', 'query'}])

    def test_transcription_purchase_post_is_gone(self):
        self.assertEqual(set(self.prepared['paths']['/v1/transcriptions']), {'get'})
        self.assertIn('TranscriptJob', self.prepared['components']['schemas'])
        self.assertNotIn('TranscriptionJob', self.prepared['components']['schemas'])

    def test_resolve_suggestion_stays_nullable(self):
        suggestion = self.prepared['components']['schemas']['ResolveSuggestion']
        self.assertEqual(suggestion['type'], ['object', 'null'])
        self.assertNotIn('allOf', suggestion)

    def test_package_exports_follow_the_generated_resources(self):
        exports = json.loads((ROOT / 'package.json').read_text())['exports']
        resources = {str(p.parent.relative_to(ROOT / 'src/api/resources')).replace('/resources/', '/') for p in (ROOT / 'src/api/resources').rglob('exports.ts')}
        self.assertEqual(set(exports) - {'.', './package.json'}, {'./' + r for r in resources})


if __name__ == '__main__':
    unittest.main()
