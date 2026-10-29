# Timeline clipboard (v51)

The focused timeline supports Ctrl+C / Ctrl+V for additional elements, and a
native right-click menu with Copy and Paste here. Keyboard paste uses the edited
playhead time; Paste here uses the clicked timeline coordinate, including scroll
and zoom. Text inputs/contenteditable areas retain ordinary text clipboard use.

Explorer media file lists, clipboard bitmaps and literal text can also be pasted.
Files use the existing managed asset importer and normal audio/image/video track
defaults, without requiring a configured media directory. Multiple files are
placed consecutively in one reversible timeline edit. Bitmaps are staged in the
project cache before the managed asset copy; plain text creates a text layer.

An internal copy carries one additional element and its referenced media/font
assets in a validated private clipboard format. Pasted elements receive fresh
IDs, independent timeline placement, transforms/presets, source-in, content
phase, volume and fade settings. Disjoint speech membership is materialized as
relative timeline ranges rather than referring to another passage's word IDs.
Cross-project paste imports independent managed resources. The locked base is
excluded. External transitions between elements are not duplicated.

Copy checks the source revision; asynchronous paste checks the target project
and cut map before commit. Rapid copy/paste commands are serialized. Imports
retain the existing source originals, managed storage, undo/redo and normal
playback/export paths.

Validation:

- 14 Node tests cover the new clipboard model, revision/base guards, native menu
  routing, image/file/text distinction and the shared Windows media readers.
- Strict frontend TypeScript checking passed.
- The packaged isolated UI test exercised native keyboard events, the native
  context-menu request and Paste here callback, multi-file imports, clipboard
  bitmap/text, muted video, preserved trim/gain/fades, undo/redo, cross-project
  managed media and persisted state after reload. Its first project contained
  nine pasted elements and its second one independent audio copy.
- The OS clipboard provider was injected in that integration test; the user's
  clipboard was never read or overwritten. The native Windows file-list reader
  is shared with the already delivered attachment clipboard integration.

Build: `scripts/stage-timeline-clipboard-build.cjs`, based on delivered v50.
The native renderer/compositor/codec files are byte-identical to that baseline.
The executable is `dist/app/timeline-clipboard-v51/win-unpacked/Edity.exe`.
