import asyncio,tempfile,unittest
import io,json,sys,types
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch
from fastapi import HTTPException
from routers.composition import validate_actions,agent_instructions,validate_candidates,ActionValidationRequest,CandidateValidationRequest

class AgentContracts(unittest.TestCase):
    def test_external_transcription_skips_secondary_llm_while_normal_ui_keeps_cleanup(self):
        import job_worker
        from unittest.mock import Mock
        raw={'words':[{'word':'hello','start':0,'end':1}],'segments':[],'language':'en'}
        for skip in (True,False):
            cleanup=Mock(return_value={'words':[{**raw['words'][0],'word':'Hello.'}],'segments':[]})
            modules={'services.verbatim_transcription':types.SimpleNamespace(transcribe_verbatim=Mock(return_value=raw)),
                     'services.sound_events':types.SimpleNamespace(detect_sound_events=Mock(return_value={'events':[]})),
                     'services.ai_provider':types.SimpleNamespace(clean_transcript_structure=cleanup)}
            request={'kind':'transcribe','payload':{'path':'fixture.mp4','engine':'crisper','language':'en','skipTranscriptCleanup':skip}}
            output=io.StringIO()
            with patch.dict(sys.modules,modules),patch('sys.stdin',io.StringIO(json.dumps(request))),redirect_stdout(output):job_worker.main()
            result=[json.loads(line.removeprefix('EDITY_EVENT ')) for line in output.getvalue().splitlines() if line.startswith('EDITY_EVENT ')][-1]['data']
            self.assertEqual(cleanup.call_count,0 if skip else 1)
            self.assertEqual(result['words'][0]['word'],'hello' if skip else 'Hello.')

    def test_action_validation_and_instructions_do_not_call_model(self):
        with patch('services.ai_provider.AIProvider.complete',side_effect=AssertionError('External tools must not invoke an LLM')) as model:
            result=asyncio.run(validate_actions(ActionValidationRequest(actions=[{'id':'cut','type':'edit','deleteRanges':[{'startIndex':1,'endIndex':2}]}])))
            self.assertEqual(result['actions'][0]['deleteRanges'][0]['endIndex'],2)
            self.assertIn('25%',asyncio.run(agent_instructions())['instructions'])
            with self.assertRaises(HTTPException) as invalid:
                asyncio.run(validate_actions(ActionValidationRequest(actions=[{'id':'cut','type':'edit','deleteRanges':[{'startIndex':1.5,'endIndex':2}]}])))
            self.assertEqual(invalid.exception.status_code,422)
            model.assert_not_called()

    def test_registered_candidates_are_file_or_verified_public_url_without_model(self):
        with tempfile.TemporaryDirectory() as root,patch('services.ai_provider.AIProvider.complete',side_effect=AssertionError('No model')) as model:
            file=Path(root)/'reference.png';file.write_bytes(b'fixture')
            result=asyncio.run(validate_candidates(CandidateValidationRequest(candidates=[{'name':'image','kind':'image','path':str(file)}])))
            self.assertEqual(result['candidates'][0]['path'],str(file.resolve()))
            with patch('services.media._check_public_https') as public:
                asyncio.run(validate_candidates(CandidateValidationRequest(candidates=[{'name':'clip','kind':'video','url':'https://example.com/clip.mp4'}])))
                public.assert_called_once_with('https://example.com/clip.mp4')
            for invalid in [{'name':'x','kind':'image','path':str(file),'url':'https://example.com/img.png'}, {'name':'x','kind':'image','path':'relative.png'}]:
                with self.assertRaises(HTTPException):asyncio.run(validate_candidates(CandidateValidationRequest(candidates=[invalid])))
            model.assert_not_called()
