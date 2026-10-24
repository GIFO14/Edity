import unittest
from pydantic import ValidationError
from services.media_actions import Action, SYSTEM

class ColorPresetActionTests(unittest.TestCase):
    def test_save_and_apply_actions_are_supported_for_sidebar_ai(self):
        saved=Action.model_validate(dict(id='save',type='saveGradePreset',name='My videos',grade=dict(exposure=.45,temperature=.1)))
        self.assertEqual(saved.grade.exposure,.45)
        applied=Action.model_validate(dict(id='apply',type='applyGradePreset',presetId='saved-id',sourceId='recording'))
        self.assertEqual(applied.sourceId,'recording')
        layer=Action.model_validate(dict(id='layer',type='applyGradePreset',presetId='saved-id',elementId='broll',expectedPresetRevision=2))
        self.assertEqual(layer.expectedPresetRevision,2)
        self.assertIn('capabilities.colorGradePresets',SYSTEM)

    def test_ambiguous_targets_and_invalid_saved_settings_are_rejected(self):
        for values in [dict(type='saveGradePreset',name='No grade'),dict(type='saveGradePreset',name='Invalid',grade=dict(exposure=6)),dict(type='applyGradePreset',presetId='id'),dict(type='applyGradePreset',presetId='id',sourceId='a',elementId='b')]:
            with self.assertRaises(ValidationError):Action.model_validate(dict(id='invalid',**values))
