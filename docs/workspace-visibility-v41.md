# Editor visibility ownership

Build `workspace-visibility-v41`, scoped over delivered `export-performance-v40`.

## Cause addressed

The editor is a native BrowserView above the workspace shell. The ready placeholder in the shell is always behind it; its text does not diagnose why a view is absent.

The old shell captured selection/import state in each ResizeObserver and focus/resize callback. It sent an unversioned array of measured panes. An empty array meant both “project home / import overlay” and “no usable measurement.” Main accepted that array unconditionally and removed every editor missing from it, even a healthy selected editor. A notification retained from a prior home or drag state could therefore remove the current editor after the UI had already changed. There was no selection ownership or ordering check.

Separately, the `unresponsive` handler explicitly removed a live view as soon as Electron reported a stall. This turned a busy editor into the same blank shell. Restoring saved tabs also used the initializer's stale null primary selection, replacing the first restored tab instead of opening the second beside it.

The user's retained diagnostics contain transcript zero-size console messages but no lifecycle failure identifying a unique triggering event for their screenshot. The tests below reproduce these concrete removal mechanisms; they do not establish that every prior disappearance had the same trigger.

## Prevention

- Disposed layout callbacks cannot publish. The stable imperative callback always delegates to the currently committed selection.
- Each committed layout has a generation, active project IDs and an explicit import suppression flag. Missing or undersized DOM measurements are skipped; they do not mean “close/hide.”
- Main accepts only shell layout requests, validates complete geometry/selection and rejects obsolete generations or conflicting same-generation state. Generation ownership resets on shell navigation.
- A busy live editor remains attached. A subsequent responsive event clears the busy reload flag. Actual crashed or failed navigations retain their separate recovery handling.
- Primary and secondary selection update atomically from the current state, including saved-tab restoration.
- Native attach/detach transitions now record a bounded reason in workspace diagnostics.

This changes visibility handling rather than the placeholder text or Reopen button. There is no periodic reopen loop, editor replacement or polling watchdog in the prevention path.

## Verification

The baseline is delivered v40 with only the opt-in verification harness added. Hidden packaged tests execute the real shell's registered callbacks after their effect is disposed, deliberately reproducing delayed notifications; the busy test emits Electron's lifecycle signal. No Reopen is clicked in these prevention tests.

| Check | Baseline | Fixed |
| --- | --- | --- |
| Delayed home callback preserves selected editor | No | Yes |
| Delayed drag callback after overlay dismissal preserves editor | No | Yes |
| Busy lifecycle signal keeps same native editor attached | No | Yes |
| Both saved tabs restore as separate panes | No | Yes |

The fixed package also passes split view, resize, close, import cancellation and layout ownership checks. A separate run uses a copy of the complete AI Code Review project: words, removals and composition are unchanged; the source document hash is unchanged. These cases retain the same webContents rather than recovering by replacement.

Three focused layout contract tests and strict production TypeScript/Vite build pass. Existing native lifecycle tests pass: cancellation during opening, an actual renderer crash with automatic reload, React render error recovery, split view, close and reopening. The final delivery report and package hash are recorded in `media-implementation-evidence/workspace-visibility-v41.json`.

The v40 export renderer, compositor, audio, backend and decoder files are preserved byte for byte. The desktop shortcut and CLI default select v41. The user's running app is not stopped or restarted; it loads the new version on its next launch.
