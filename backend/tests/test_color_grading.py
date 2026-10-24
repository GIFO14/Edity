import unittest,json,subprocess
from pathlib import Path
from pydantic import ValidationError
from services.composition_models import ColorGrade
from services.media_actions import Operation
from services.color_pipeline import _metadata,managed_color_filter
from unittest.mock import patch

class ColorContracts(unittest.TestCase):
    def test_neutral_and_limits(self):
        self.assertEqual(ColorGrade().contrast,1)
        for key,value in [('exposure',5.1),('saturation',-1),('tint',2),('rolloff',-1),('contrast',float('nan')),('mask',{'width':0})]:
            with self.subTest(key=key),self.assertRaises(ValidationError):ColorGrade.model_validate({key:value})
        with self.assertRaises(ValidationError):ColorGrade.model_validate({'lut':'fake.cube'})
    def test_actions_fill_defaults_and_allow_reversible_reset(self):
        op=Operation.model_validate({'type':'sourceGrade','sourceId':'clip','grade':{'exposure':.4}})
        self.assertEqual(op.grade.saturation,1)
        self.assertIsNone(Operation.model_validate({'type':'sourceGrade','sourceId':'clip','grade':None}).grade)
        with self.assertRaises(ValidationError):Operation.model_validate({'type':'sourceGrade','grade':{}})
    def test_python_and_node_decode_contracts_agree(self):
        p=Path(__file__)
        for color in [{'space':'bt709','transfer':'bt709','primaries':'bt709','range':'tv','format':'yuv420p'}, {'space':'gbr','transfer':'iec61966-2-1','primaries':'bt709','range':'pc','format':'gbrp'},{}]:
            video={**{'height':1080},**{b:color[a] for a,b in [('space','color_space'),('transfer','color_transfer'),('primaries','color_primaries'),('range','color_range'),('format','pix_fmt')] if a in color}}
            with patch('services.color_pipeline._metadata',return_value=video):expected=managed_color_filter(p)
            result=subprocess.check_output(['node','-e',"process.stdout.write(require('./shared/color-decode.cjs').managedColorFilter(JSON.parse(process.argv[1])))",json.dumps({'height':1080,'color':color})],cwd=Path(__file__).resolve().parents[2],text=True)
            self.assertEqual(result,expected)
        with patch('services.color_pipeline._metadata',return_value={'color_transfer':'smpte2084'}),self.assertRaises(ValueError):managed_color_filter(p)

if __name__=='__main__':unittest.main()
