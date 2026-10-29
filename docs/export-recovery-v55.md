# Export recovery and Resolve handoff (v55)

Normal video exports now render to a local scratch directory before publishing
the validated, closed file to the requested destination. This avoids streaming
the encoder output directly to a virtual/cloud destination. Cancellation keeps
an earlier destination intact; a failed publication preserves the completed
local file and reports its recovery path. Concurrent destination changes are
never overwritten. Broken encoder pipes now expose bounded FFmpeg diagnostics.

The compatible encoder now uses the compositor's exact whole-frame duration.
Previously a fractional duration could make FFmpeg stop one frame before the
compositor, causing early pipe closure or strict final-frame validation failure.
A real 2.123456-second, 60 FPS control encoded 127 frames; the corrected path
encodes the expected 128. Encoding quality settings and the delivered compositor
are unchanged. The original historical `write EOF` message did not retain enough
diagnostics to establish its precise cause retrospectively.

The authorized full-project retry completed at revision 300: 28,426 frames,
1920x1080 at 60 FPS, 473.766667 seconds, H.264 video and AAC audio, 52,672,732
bytes. An independent complete FFmpeg decode of the published MP4 returned no
errors. The successful retry took 1,138.575 seconds using the compatible route;
the system's free-memory limits prevented the accelerated route. This verifies
file integrity and duration, not an editorial review of every shot.

Resolve handoff includes native cuts, supplemental audio, music, B-roll, still
images and editable titles, with timing and gain/fade envelopes. Exact Edity
text styling, animation, transitions, grading and unsupported effects use silent
rendered appearance clips above the native layers. Disable the appearance clip
before changing its underlying picture in Resolve. The JSON sidecar retains
the exact Edity settings and portable media mapping. Studio Sound remains a
normal rendered-video option rather than baked into the editable source audio.

Validation: 23 Node tests passed. The final packaged v55 private integration
export included two base cuts, two audio layers, B-roll, a still, an editable
title and a 240-frame appearance clip. Its XML passed Apple's FCPXML 1.6 DTD,
media-presence and timeline-clock checks. Earlier native Resolve QA confirmed
still-image import, editable Rich Text and the music envelope (-96 dB initially,
-18 dB after the fade-in, -24 dB during fade-out). The final v55 XML was not
reimported into Resolve after the user requested no further FCPXML work.

Reproduce private verification with `scripts/stage-export-handoff-build.cjs`
and `scripts/run-export-handoff-verification.ps1 -Root <new-private-directory>`.
The recovery mode requires an explicitly authorized frozen snapshot and refuses
to overwrite an existing final output. `scripts/verify-resolve-handoff.py`
independently validates the XML against a separately obtained Apple 1.6 DTD.

Delivered executable: `dist/app/resolve-handoff-v55/win-unpacked/Edity.exe`.
Archive SHA-256: `fece559d463e5d8ed783731b99187d40debc170dcf7ddddef7bccb12fe03c20c`.
The desktop shortcut and isolated CLI default target this version. Desktop
activation preserved all 12 project editing fingerprints.
