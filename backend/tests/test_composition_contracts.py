import json,unittest
from pathlib import Path
from services.composition_models import Composition
class SharedContracts(unittest.TestCase):
    def test_exact_recorded_frame_rate_does_not_use_canvas_limits(self):
        from copy import deepcopy
        case=json.loads((Path(__file__).resolve().parents[2]/'tests/fixtures/composition/validation.json').read_text())[0]['document']
        doc=deepcopy(case)
        asset={'id':'recording','kind':'video','path':'recording.mp4','hash':'recording','name':'recording.mp4','durationUs':1000000,'width':1920,'height':1080,'hasAudio':True,'hasAlpha':False,'status':'ready','fps':{'num':971401,'den':16190}}
        doc['assets']['recording']=asset
        Composition.model_validate(doc)
        doc['canvas']['fps']=asset['fps'].copy()
        with self.assertRaises(ValueError):Composition.model_validate(doc)
        doc['canvas']['fps']={'num':30,'den':1}
        for fps in [{'num':0,'den':1},{'num':60,'den':0},{'num':1.5,'den':1},{'num':9_007_199_254_740_992,'den':1}]:
            asset['fps']=fps
            with self.subTest(fps=fps), self.assertRaises(ValueError):Composition.model_validate(doc)

    def test_rgba_frames_request_accepts_exact_recorded_rate(self):
        from routers.composition import FramesRequest
        request=FramesRequest(path='alpha.mov',timeUs=0,width=240,height=140,fpsNum=971401,fpsDen=16190)
        self.assertEqual((request.fpsNum,request.fpsDen),(971401,16190))
        with self.assertRaises(ValueError):FramesRequest(path='alpha.mov',timeUs=0,width=240,height=140,fpsNum=971401,fpsDen=0)

    def test_shared_vectors(self):
        cases=json.loads((Path(__file__).resolve().parents[2]/'tests/fixtures/composition/validation.json').read_text())
        for case in cases:
            with self.subTest(case=case['name']):
                if case['valid']:Composition.model_validate(case['document'])
                else:
                    with self.assertRaises(ValueError):Composition.model_validate(case['document'])
