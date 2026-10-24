import json
import unittest
from unittest.mock import patch
from services.ai_context import compact_payload, CONTEXT_LIMIT, safe_model_error
from services.media_actions import ai_turn
from services.ai_provider import _codex_complete


class AIContextTests(unittest.TestCase):
    def test_compaction_preserves_all_words_indices_times_and_instructions(self):
        words = [dict(id=f'w{i}', word='paraula', start=i*.31, end=i*.31+.2,
                      index=i, clipId='clip', confidence=0) for i in range(5000)]
        original = {'words': words, 'instructions': 'Keep the last take',
                    'deletedIndices': [1, 7], 'history': [{'role': 'error', 'text': 'echo'},
                                                        {'role': 'user', 'text': 'keep'}]}
        result = json.loads(compact_payload(original, []))['context']
        rebuilt = [{**result['wordDefaults'], **word} for word in result['words']]
        self.assertEqual(rebuilt, words)
        self.assertEqual(result['instructions'], original['instructions'])
        self.assertEqual(result['deletedIndices'], [1, 7])
        self.assertEqual(result['history'], [{'role': 'user', 'text': 'keep'}])
        self.assertEqual(original['words'][0]['clipId'], 'clip')

    def test_row_encoding_preserves_different_clips_and_optional_fields(self):
        words = [dict(id=f'w{i}', word='a', start=i, end=i+.2,index=i,
                      clipId='a' if i%2 else 'b') for i in range(20)]
        prompt = compact_payload({'words': words}, [], max_chars=1400)
        data = json.loads(prompt)['context']
        self.assertEqual(data['wordEncoding'], 'rows')
        self.assertEqual([dict(zip(data['wordFields'], row)) for row in data['words']], words)

    def test_preflight_rejects_oversized_instructions_without_calling_provider(self):
        with patch('services.media_actions.AIProvider.complete') as complete:
            with self.assertRaisesRegex(RuntimeError, CONTEXT_LIMIT):
                ai_turn({'instructions': 'x'*950000}, [])
            complete.assert_not_called()

    def test_provider_receives_compact_prompt_with_complete_transcript(self):
        with patch('services.media_actions.AIProvider.complete', return_value='{"actions":[{"id":"done","type":"done"}]}') as complete:
            ai_turn({'words': [{'id':'w','index':0,'word':'test','start':0,'end':1}]}, [])
        data=json.loads(complete.call_args.args[0])
        self.assertEqual(data['context']['words'][0]['id'], 'w')

    def test_context_errors_never_echo_the_serialized_document(self):
        self.assertIn(CONTEXT_LIMIT, safe_model_error('secret context input_too_large'))
        self.assertNotIn('secret', safe_model_error('secret context input_too_large'))
        self.assertNotIn('secret', safe_model_error('secret unrecognized stderr'))

    def test_owned_cli_failure_is_sanitized_without_a_model_call(self):
        with patch('services.ai_provider._find_codex_cli', return_value='codex.exe'), \
                patch('services.ai_provider.read_ai_settings', return_value={'model':'','reasoning_effort':''}), \
                patch('services.asset_preparation.run', side_effect=RuntimeError('PRIVATE TRANSCRIPT input_too_large')):
            with self.assertRaisesRegex(RuntimeError, CONTEXT_LIMIT) as caught:
                _codex_complete('data', None, job_id='qa')
        self.assertNotIn('PRIVATE TRANSCRIPT', str(caught.exception))
