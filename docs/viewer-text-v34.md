# Direct text editing in the viewer

Build: `viewer-text-v34`, based on verified `color-presets-v33`.

- Double-click an editable text layer in the player, or select it and click **Edit text** in the player.
- The player pauses and an editor opens over the text. The initial content is selected for easy replacement; normal caret selection, typing and plain-text paste remain available.
- **Enter** inserts a newline. **Ctrl+Enter** or **Save** commits the content. Clicking outside also saves. **Escape** or **Cancel** discards the draft.
- Typing uses the existing composition draft for preview. A successful save changes only `Element.text` in one project history transaction. Placement, transform, typography, presets and other fields remain intact. Normal project undo/redo works after closing the editor.
- Text editing does not open Media. Space, B/V, Delete and project shortcuts do not hijack typing in the textarea. Imported fonts use the same registered font family as the renderer.
- The editing panel stays within the player as multiline content grows. Saving errors retain the draft; a concurrent external text change is reported instead of silently overwritten.

The saved content is the same ordinary text field consumed by preview, export and external AI context. No new render format, backend contract or AI-specific substitute is introduced. Shared rendering, audio mixing, color presets and the existing timeline remain based on v33.

Verification uses an isolated packaged app with native double-clicks, clicks and keyboard input. It covers direct editing, the edit button, multiline Unicode/literal text, keyboard isolation, saving/cancelling/outside clicks, single-step history, undo/redo, unchanged styling, moving/resizing after editing and reopening the saved project. Evidence is in `docs/media-implementation-evidence/viewer-text-v34.json`.
