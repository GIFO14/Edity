import unittest
from unittest.mock import patch
import torch
from services import transcription
class TranscriptionDevice(unittest.TestCase):
    def test_whisperx_passes_device_type_and_index_separately(self):
        with patch.object(transcription,'WHISPERX_AVAILABLE',True),patch.object(transcription.whisperx,'load_model') as load,patch.dict(transcription._model_cache,{},clear=True):
            transcription._load_model('tiny',torch.device('cuda:2'))
            self.assertEqual(load.call_args.kwargs['device'],'cuda');self.assertEqual(load.call_args.kwargs['device_index'],2);self.assertEqual(load.call_args.kwargs['compute_type'],'float16')
            transcription._load_model('tiny',torch.device('cpu'))
            self.assertEqual(load.call_args.kwargs['device'],'cpu');self.assertEqual(load.call_args.kwargs['device_index'],0);self.assertEqual(load.call_args.kwargs['compute_type'],'int8')
