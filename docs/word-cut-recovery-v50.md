# Retained word endings and alignment recovery (v50)

## Cause and correction

Recognizer word times are estimates. In the reported Spanish recording, the
recognizer ended `manual` at 416.340 s; local forced alignment places its spoken
end at 416.632 s (score 0.899). The following removed `vale` starts at 416.813 s.
The original processed media contains the full word. Deleting the following word
exposed the early recognizer endpoint because WhisperX was missing from the
Python interpreter used by the desktop application.

The energy-only fallback searched at most 160 ms beyond that endpoint and could
not recover this tail. More importantly, that fallback was persisted as if the
alignment had succeeded. Installing the aligner alone did not invalidate either
the refinement cache or the in-memory cut manifest; older v9 entries could also
be inherited without rechecking their alignment availability.

The backend now:

- Checks and loads the language's word-boundary aligner before normal import
  transcription. A missing package/model leaves the managed job retryable,
  preserving completed media preparation, rather than completing an import
  without its cut-alignment dependency. GPU is preferred, with CPU available.
- Records this preflight in `processing.boundaryAlignment[clipId]` for desktop,
  sidebar and external-agent imports through the same processing worker.
- Separates refinement/manifest/visual-word caches by the installed alignment
  runtime, advances their policies, and stops inheriting unchecked v9 joins.
- Does not persist an energy-only result when the alignment runtime failed.
  Model-download failures expire after 60 seconds instead of disabling that
  language/device permanently until restart.

This retains the existing conservative forced-alignment, confidence/displacement
checks, explicit manual boundary locks, shared preview/export manifest and join
margin. Recognizer times and uncertain acoustic matches remain approximate;
this does not claim perfect segmentation of every spoken phoneme.

## Existing project repair

The two requested projects were rechecked against their prepared audio. Only
tail extensions supported by a retained-word score >= 0.65 and a following
removed-word score >= 0.65 were committed, stopping before that removed speech.
There were 34 such corrections in `2026-10-29 16-37-38` and 47 in
`2026-10-29 14-42-19`. Word IDs and the deletion selections were preserved; each
project has one grouped, reversible boundary-edit action. Uncertain candidates
were not given explicit overrides. The running desktop was not restarted.

The actual current desktop manifest now keeps `manual` through 416.682746 s,
including the import profile's short tail margin, before entering the next
retained passage. Original media and existing exports were preserved.

## Validation and delivery

- Targeted Python regression tests cover cache recovery without a document
  edit, installation invalidation, transient model failures, import preflight,
  timing protection, explicit locks and shared manifests.
  All 50 Python and 12 Node tests passed. The Windows repair script was also
  executed successfully using Windows PowerShell and the desktop interpreter.
- The packaged build imported a private six-second real-audio fixture with the
  deliberately early word endpoint. Removing `vale` automatically recovered the
  retained ending to 2.720 s; undo/redo preserved that result.
- A private 540p/60 FPS export retained the formerly missing 2.340–2.632 s audio
  interval, with normalized source/output correlation 0.99988. No full user video
  was exported for this repair.
- Both current desktop manifests were read after the edits, including the full
  `manual` ending. The renderer/codec JavaScript is unchanged from delivered v49.
- A fresh normal process import in the final packaged build completed with a
  CUDA/Spanish boundary-alignment readiness record. The current desktop's
  external worker/backend Python files were backed up and updated atomically,
  with the worker entry point last, so new imports gain the preflight without
  restarting the open editor. Already loaded backend modules keep their current
  in-memory state; the complete cache policy is loaded on the next ordinary
  application launch. Both existing projects were repaired and verified live.

The Windows transcription repair is reproducible with
`scripts/repair-windows-transcription.ps1 -Python <Edity's interpreter>` and its
paired constraints. This pins the CUDA torch/torchaudio family while installing
the ASR, alignment and sound-review dependencies.

The backend-only build script is `scripts/stage-word-cut-recovery-build.cjs`.
The v50 desktop/CLI executable is
`dist/app/word-cut-recovery-v50/win-unpacked/Edity.exe`.
