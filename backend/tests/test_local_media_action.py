import unittest
from pydantic import ValidationError
from services.media_actions import Action, SYSTEM

class LocalMediaActionTests(unittest.TestCase):
    def test_register_local_contract(self):
        action=Action(id='song',type='registerLocal',kind='audio',path='C:/Other folder/Música.wav')
        self.assertEqual(action.kind,'audio')
        self.assertEqual(action.model_dump()['path'],'C:/Other folder/Música.wav')
        for fields in ({'kind':'audio'},{'path':'C:/file.wav'}):
            with self.assertRaises(ValidationError):Action(id='bad',type='registerLocal',**fields)
        self.assertIn('not restricted to mediaFolders',SYSTEM)

if __name__=='__main__':unittest.main()
