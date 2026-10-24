# Playback controls v46

- Composite fullscreen viewer includes base video, B-roll, text and controls; Escape or exit button restores the mounted editor.
- Preview selector: Auto (720p), 360p, 480p, 720p, 1080p, Original. Preference is local, not part of project/export settings.
- Canvas, base proxy and supplemental video decoders honor preview quality. Original bypasses preview proxies. New proxies never upscale the source.
- Source changes freeze and restore the shared audio clock, source time, speed and playback state.
- Native BrowserView occupies the entire fullscreen window and restores its previous pane on Electron's leave-html-full-screen event.
- Scoped overlay on v45; Electron 43.8.3 and the delivered export worker/compositor/runtime remain unchanged.

## Verification

- TypeScript strict check passed.
- 7 existing preview tests passed.
- 2 new backend tests passed: real 360/480/720/1080 encodes, original checksum preserved, separate caches, 1080 RGBA decode.
- Packaged native integration passed all qualities at source time 2s, paused state preserved; real 1920x1080 fullscreen, Escape and exit button restore bounds; playback and shared clock continue when changing quality; project composition unchanged.
- Evidence: dist/qa/playback-options-v46/verification.json and D:/Edity-media-verification/playback-options-v46-r5/fullscreen.png.

Archive SHA256: e7031bc6ca4be2530702a03904c78c74a8da5451c0734d86b2c76e7bb6666560
