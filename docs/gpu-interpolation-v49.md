# GPU interpolation in Edity v49

New imports with **Millorar fluïdesa a 60 FPS** now prefer **RIFE on Vulkan**.
The tested device is the NVIDIA RTX 4070 on Windows 11. NVENC remains a separate
encoder choice; motion inference still runs on the GPU when x264 must encode.
Existing projects are not reprocessed. Native 60+ FPS footage remains untouched.

## Implementation

- `backend/services/rife_interpolation.py`: pinned runtime discovery, bounded
  decode/inference batches, original/scene/static protections and continuous
  encoding. Source pictures bypass neural synthesis on the even output grid.
- `backend/services/frame_interpolation.py`: GPU preference, separate reproducible
  engine/model/policy cache keys, common output validation and CPU fallback.
  Cancellation and word/source-time mappings keep the existing owned-job contract.
- `resources/rife-runtime.json` and `scripts/install-rife-runtime.py`: verified
  executable, model, OpenMP DLL and license from the official upstream release.
  HTTP range reads retrieve only selected ZIP members; unused models are not
  installed in the application. Selected files total **17,510,652 bytes**.
- `scripts/stage-gpu-interpolation-build.cjs`: retains the delivered Electron
  43.8.3/compositor baseline and packages the runtime outside ASAR. Output:
  `dist/app/interpolation-gpu-v49/win-unpacked/Edity.exe`.
- Import UI, agent capabilities and VideoAnalysisPlugin's editing guide explain
  the preferred GPU engine and CPU fallback. Backend workflow version is 31.

The model is **RIFE v4**, from nihui's portable `20221029` release. v4.6, its
spatial/temporal augmentation modes, v4 and v2.3 were compared on the small-text
fixture. v4 preserved its title and code better than the other RIFE candidates.
This is a measured selection, not an assumption that a newer model is better.

No PyTorch, CUDA toolkit, OpenCV or cloud inference dependency is added. The
Vulkan runtime and weights are bundled; normal imports make no model download.
Development setup uses `python scripts/install-rife-runtime.py` before packaging.
The source manifest includes pinned SHA-256 checksums and the upstream MIT license.

## Timing, protections and storage

Input is normalized on an explicit 30 FPS grid before 2x inference, including VFR
recordings. Small rounding differences for fractional input rates remain within
one output frame. The original audio bypasses the model and is copied where the
container permits it. RGB encoding explicitly uses a BT.709 YUV matrix, preserves
known source transfer/primaries and tags the derived SDR video accordingly.

Each batch contains at most **91 source PNGs** (90 plus a future picture) and
182 generated PNGs. Batches overlap correctly at their source-time boundaries,
are encoded through one continuous raw RGB pipe and are removed immediately.
Storage is bounded by a batch, rather than the entire recording, but can still
reach hundreds of megabytes for complex images. Completed derivatives remain in
the existing interpolation cache, which currently has no automatic size quota.

Consecutive identical pictures are retained. A conservative scene-difference
guard holds the prior picture at a detected cut. Confirmed static 128x64 regions
(maximum RGB disagreement of two code values) also bypass neural synthesis, so a
moving face/cursor elsewhere need not cause static letters to change. These
guards run on the CPU; the RIFE motion model runs on the GPU.

GPU failures never publish a partial successful result. Normal `auto` mode reports
the GPU error and uses the existing CPU MCI route. Resume cleans abandoned owned
batch directories under the same cache lock. `clips[].interpolation` exposes the
actual engine, GPU, model, encoder, stage times, static/scene guards and fallback
reason. Old CPU cache entries remain reusable when CPU fallback is needed.

Diagnostic environment overrides are `EDITY_INTERPOLATION_ENGINE=auto|gpu|cpu`,
`EDITY_RIFE_GPU` (non-negative Vulkan device index, default 0), and `EDITY_RIFE_DIR`
(a directory containing the pinned runtime). Strict `gpu` mode fails instead of
hiding a problem through CPU fallback; packaged GPU QA uses it.

## Actual verification

The reproducible fixtures and assertions live in
`scripts/verify-frame-interpolation.py`,
`scripts/run-gpu-interpolation-verification.ps1`,
`electron/interpolation-verification.js`, and
`backend/tests/test_rife_interpolation.py`.

Verified on Windows 11 Enterprise build 26200 / Ryzen 5800X / RTX 4070:

- Genuine new midpoint pictures, 1080p30 to 1080p60, unchanged source checksum,
  identical decoded audio PCM for the AAC fixture, constant timestamps/duration.
- Repeated/static pictures, scene cuts, VFR, 29.97 FPS and native 60/120 opt-out.
- Three consecutive processing batches over 6.2 seconds: frame positions at both
  boundaries match the originals, with 372 output frames and unchanged duration.
- Real silence removal retains 60 FPS and its original-to-processed source map.
- Packaged import checkbox, real bridge imports, cancellation during GPU inference,
  cleanup/resume, cache reuse, mixed clips, stable word IDs and undo/redo.
- Reviewed final 1080p60 exports retain the new midpoint pictures, scene cuts and
  audio timing; the 1080p30 control remains functional. Resource-gated compatible
  encoding remains available when memory/native encoder support is insufficient.
- GPU inference failure safely falls back; missing runtime is handled; GPU motion
  still runs with x264 when only NVENC is unavailable; static-region protection.

The 3-second 1080p fixture takes approximately **11 seconds end to end**, compared
with **39–43 seconds** for the prior CPU MCI implementation: about **3.7x faster**
on this short sample. About four seconds are inside the RIFE CLI, including its
startup and image I/O, not a GPU-kernel-only timer. Remaining time includes
decode, checks, frame I/O and encoding. No long-recording throughput is promised.
Exact measurements and packaged evidence are in `qa/gpu-interpolation-v49.json`.

## Quality limits

Interpolation estimates missing motion. It cannot guarantee original detail in
generated frames. Moving small text can still warp or ghost; scene detection is
a heuristic, and ambiguous OBS freezes are diagnosed rather than reconstructed.
The originals are retained; no lossless-video claim is made for the H.264 copy.

The single-frame synthetic translation comparison illustrates the tradeoff:

| Engine/model | Title MAE (0–255) | Scrolling code MAE (0–255) |
| --- | ---: | ---: |
| RIFE v4.6 | 4.61 | 12.51 |
| RIFE v4 | 0.87 | 7.38 |
| RIFE v2.3 | 1.08 | 8.50 |
| CPU MCI reference | 2.97 | 1.76 |

These compare a known translation against a bilinear midpoint in two fixture
regions. They are not a perceptual ranking for arbitrary footage. CPU MCI is
better on this particular scrolling-code region; RIFE v4 is better on its title.
Static-region protection does not solve every moving-text artifact. The CPU
override remains available when its result is preferable. HDR/high-bit-depth
preservation and advanced freeze reconstruction remain outside this delivery.
