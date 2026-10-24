# Native GPU export

Build `export-gpu-v43`, scoped over delivered `workspace-visibility-v41`.

## Changes

Eligible 1080p30 MP4 exports now decode supported H.264 SDR sources using the GPU, run the delivered composition shaders and pass the canvas directly to native H.264 encoding. This removes the repeated full RGBA CPU transfers from that path. Other source formats retain the managed FFmpeg decoder. Unsupported native encoding retries the compatible exporter before publishing any output.

Parallel renderers split only at points where every active moving source would restart its decoder in the uninterrupted export. They retain global composition time, crop/grade/text/animation timing and the existing source FPS grid. Concurrency is capped at six and reduced with available memory. Aggregated progress emits integer changes rather than six streams of fractional job snapshots.

The packet decoder reproduces FFmpeg's input seek rounding and FPS sampling. Default rawvideo CFR duplicates an initial picture when the first filtered PTS is positive; the selected 60fps path uses passthrough instead. An early prototype omitted this distinction and advanced some pictures. That prototype was rejected. Hardware preroll pictures are closed immediately to avoid exhausting the decoder surface pool, consistent with the [WebCodecs resource lifecycle](https://www.w3.org/TR/webcodecs/).

Output frame count, dimensions, duration and audio presence are validated before publishing. Cancellation tracks packet inspection processes, decoders, renderers and muxing. The frontend build, backend audio mixer, composition runtime and v41 workspace visibility fix are preserved.

## Verification

The complete saved AI Code Review project, revision 1506, was exported through the normal external bridge in an isolated instance. The snapshot, words, cuts, composition, manifest and export settings match the v41 comparison: 1920×1080, 30fps, H.264 MP4, Studio Sound enabled, no captions. The source project and original exported video hashes remain unchanged.

| Measurement | Result |
| --- | --- |
| Timeline duration | 11:05.464 |
| v41 complete export | 9:19.5 |
| GPU complete export, including audio preparation and final copy | **2:12.8** |
| Speedup from v41 | **4.21×**, 76.3% less time |
| Final frames | 19,964 |
| Output size | 965,366,315 bytes |

Every frame was compared against the conservative native encode using the stable FFmpeg source decoder: minimum PSNR 47.95dB, average 50.93dB. The complete output, including audio, independently decodes without errors; representative footage, B-roll and diagrams were visually inspected. The final package's 24-second comparison against the stable compositor's lossless reference scores VMAF 96.72, versus 96.06 for the earlier stable CRF18 encode. These measurements use [FFmpeg's comparison filters](https://www.ffmpeg.org/ffmpeg-filters.html).

The unchanged audio mixer differs from the prior run by approximately −73dB due to floating point processing. The delivered AAC audio was independently compared with its actual mixed WAV (30.87dB SNR), retains both channels and differs in length only by normal AAC padding. It is not described as PCM bit identical.

The final package passes the native export and cancellation tests, with no incomplete published output, strict TypeScript checking and 12 focused acceleration/frame-selection/job-persistence/workspace tests. The full export used the research package; the final package adds cancellation tracking and idempotent decoder close, then repeats the short export, quality and cancellation checks. Its UI and shader behavior remain unchanged.

Evidence: `docs/media-implementation-evidence/export-gpu-v43.json`. Full export and frame-by-frame reports: `D:/Edity-media-verification/full-export-v43-20261019`.

## Limits

This is one measured project, not an average across all videos. Export time is about **20%** of duration, so the initial 10% target has not been reached. Native QP0 is not claimed to be mathematically lossless; it preserves the tested quality at the cost of a larger file. Unsupported resolutions, frame rates, formats and low-memory systems retain the compatible path.

The intermediate 4:55.6 RGBA trial accidentally omitted Studio Sound and is excluded from the timing comparison. Its video was used only as an independent frame reference and then removed after verification. No user app was restarted during verification. The desktop shortcut and CLI select v43 on the next launch.
