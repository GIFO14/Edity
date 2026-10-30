# Backend startup reliability (v56)

The reported desktop was waiting in the startup-error dialog while its owned
Python process was already serving a valid `/health` response. The UI had
declared failure after 30 seconds, so a slow but healthy start could not recover.
This was not evidence of a missing Python dependency or missing FFmpeg.

The startup import chain was `routers.preview` → `word_boundary_alignment` →
`verbatim_transcription` → `utils.audio_processing` → MoviePy. Import profiling
confirmed that MoviePy initialized its effects/image stack before any processing
request. Word-boundary transcription and MoviePy audio loading are now lazy;
the same extraction/alignment functions still load their dependencies when used.

Startup allows 120 seconds for cold imports under system load, with bounded
individual health requests and a single polling loop. Silent or unfinished HTTP
responses cannot hang the readiness check indefinitely. Real Python failures
still abort startup immediately; recent backend stderr is included in the error,
and a failed start stops only its owned backend process. The error text no longer
asserts that every timeout means dependencies need installing.

Validation: five Node tests cover delayed readiness, silent peers, partial
responses, malformed/wrong-version health replies and early Python errors. A
fresh-process Python test blocks imports of MoviePy, Torch, WhisperX and
Transformers while checking health and route registration; it passed. All seven
alignment-recovery tests passed. An isolated packaged v56 session launched a
fresh backend and served the project API successfully, then closed normally.
The desktop backend also became ready. Its first concurrent cold workspace
restore hit the separate existing 20-second view-loading limit; opening the
project through the normal `projects.open` bridge then displayed its player,
timeline and transcript. That workspace timeout policy is unchanged by this fix.
All 14 editing fingerprints matched immediately after desktop activation.

Build with `node scripts/stage-backend-startup-build.cjs`. It pins the delivered
v55 archive, changes only startup handling and the two Python import sites, and
asserts that the compositor, renderer and Resolve exporter remain byte-identical.
The v55 MP4 and FCPXML improvements are retained without further FCPXML changes.

Delivered executable: `dist/app/backend-startup-v56/win-unpacked/Edity.exe`.
Archive SHA-256: `97b9ae25430614635b36f3a932bef72e81150953a927103f77f8e06f1ef191bc`.
