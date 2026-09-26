import json
import unittest
from unittest.mock import patch

from services.ai_provider import AIProvider, clean_transcript_structure, detect_filler_words


class TranscriptCleanupTests(unittest.TestCase):
    def test_cleanup_keeps_timing_count_and_marks_clip_boundaries(self):
        words = [
            {"index": 0, "word": "anem", "start": 0.0, "end": 0.3, "clipId": "one"},
            {"index": 1, "word": "[UH]", "start": 0.31, "end": 0.45, "clipId": "one"},
            {"index": 2, "word": "Barcelona", "start": 0.46, "end": 0.9, "clipId": "one"},
            {"index": 3, "word": "Hello", "start": 1.0, "end": 1.2, "clipId": "two"},
            {"index": 4, "word": "there", "start": 1.21, "end": 1.5, "clipId": "two"},
        ]
        answer = {"corrections": [
            {"index": 1, "text": "a", "reason": "required Catalan preposition"},
            {"index": 2, "text": "Madrid", "reason": "attempted rewrite"},
            {"index": 3, "text": "Hello,", "reason": "punctuation"},
        ], "paragraphStarts": [0]}
        with patch.object(AIProvider, "complete", return_value=json.dumps(answer)):
            result = clean_transcript_structure(words, "ca")

        self.assertEqual([word["word"] for word in result["words"]],
                         ["anem", "a", "Barcelona", "Hello,", "there"])
        self.assertEqual([(word["start"], word["end"]) for word in result["words"]],
                         [(word["start"], word["end"]) for word in words])
        self.assertEqual(result["paragraphStarts"], [0, 3])
        self.assertEqual([len(segment["words"]) for segment in result["segments"]], [3, 2])

    def test_filler_detection_never_returns_literal_a(self):
        words = [
            {"index": 0, "word": "vaig"},
            {"index": 1, "word": "a"},
            {"index": 2, "word": "casa"},
            {"index": 3, "word": "[UH]"},
        ]
        answer = {"wordIndices": [1, 3], "fillerWords": [
            {"index": 1, "word": "a", "reason": "wrong"},
            {"index": 3, "word": "[UH]", "reason": "hesitation"},
        ]}
        with patch.object(AIProvider, "complete", return_value=json.dumps(answer)) as complete:
            result = detect_filler_words("vaig a casa [UH]", words, provider="codex")

        self.assertEqual(result["wordIndices"], [3])
        self.assertEqual([item["index"] for item in result["fillerWords"]], [3])
        self.assertIn("Catalan preposition", complete.call_args.kwargs["prompt"])

    def test_required_english_article_is_restored_even_when_codex_misses_it(self):
        words = [
            {"index": 0, "word": "Then", "start": 0.0, "end": 0.2},
            {"index": 1, "word": "set", "start": 0.2, "end": 0.4},
            {"index": 2, "word": "up", "start": 0.4, "end": 0.5},
            {"index": 3, "word": "[UH]", "start": 0.5, "end": 0.65},
            {"index": 4, "word": "contract.", "start": 0.65, "end": 1.0},
        ]
        with patch.object(AIProvider, "complete", return_value=json.dumps(
                {"corrections": [], "paragraphStarts": [0]})):
            result = clean_transcript_structure(words, "en")
        self.assertEqual([word["word"] for word in result["words"]],
                         ["Then", "set", "up", "a", "contract."])
        self.assertEqual(result["corrections"], [{
            "index": 3, "text": "a", "reason": "Required English indefinite article, not a hesitation"}])

    def test_required_article_cannot_be_marked_as_filler(self):
        words = [
            {"index": 0, "word": "set"}, {"index": 1, "word": "up"},
            {"index": 2, "word": "[UH]"}, {"index": 3, "word": "contract"},
        ]
        answer = {"wordIndices": [2], "fillerWords": [
            {"index": 2, "word": "[UH]", "reason": "hesitation"}]}
        with patch.object(AIProvider, "complete", return_value=json.dumps(answer)):
            result = detect_filler_words("set up [UH] contract", words, provider="codex")
        self.assertEqual(result, {"wordIndices": [], "fillerWords": []})


if __name__ == "__main__":
    unittest.main()
