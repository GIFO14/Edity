# Stable music under speech — v47

## Cause

The current AI SRE/Pi Durable project explicitly enabled music ducking. The old compiler merged speech gaps only up to 240 ms and restored music gain in 180 ms, creating repeated 12.04 dB swells during normal breaths. Its intro had 53 unity-gain envelope points before 66.7 s. Neither per-file gain nor frequency processing caused those planned level changes.

## Program correction

The common browser/CLI/export composition compiler now builds phrase-level speech ducking: 120 ms attack, 500 ms hold and 900 ms release. Overlapping envelope windows merge across breaths and edit seams; times remain strictly ordered and a truncated final release preserves its intermediate gain. Muted voice does not duck music. Existing gain, fades, source offsets, edits and music files remain intact. Ducking remains optional and defaults off. Inspector and AI capabilities describe its behavior and how constant gain differs.

## Checks

- 18 focused JavaScript tests and strict TypeScript passed; 2 existing music fidelity tests passed.
- Real intro plan changes only its speech ducking envelope: 53 unity points become zero during continuous speech.
- On the imported song, measured output/source RMS gain range changes from 0.03697765–0.14791083 to 0.03697765–0.03697771, matching the selected gain plus enabled speech attenuation. Original song hash unchanged.
- Full PCM output and concatenated six-second preview fragments are identical.
- Packaged playback buffers retain their gain over short pauses and fragment boundaries; long silence restores level gradually. A normal 18-second MP4 export measured at five positions matches the expected levels within 5% AAC tolerance.
- Scoped overlay on v46 preserves Electron 43.8.3, native fullscreen, preview quality controls and video export renderer byte for byte. The shared audio compiler is updated for export and CLI parity.

Evidence: `media-implementation-evidence/music-stability-v47.json`.

## Activation

Desktop shortcut and CLI select v47. The active project remains at revision 1319 with identical composition, words and cuts. The real desktop bridge advertises optional phrase-level ducking to external AI editors.
