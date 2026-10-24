# Reusable color grading presets

Build: `color-presets-v33`, based on verified `timeline-editing-v32`.

## Manual use

In **Media → Color correction / grading**:

1. Choose a recording/media source or an individual layer.
2. Adjust the color controls. Enter a preset name and click **Save new preset** to save the settings currently shown, including the enabled state and optional mask.
3. In another project, select the preset and click **Apply preset**. This commits one undoable project edit.
4. **Update selected** replaces the selected library preset with the current settings, retaining its ID and increasing its revision.

The library is stored in the existing `editing-library.json` under Edity's user data, alongside instruction profiles and effect variants. It survives app restarts. Updates are broadcast to open editors so presets created by the CLI or sidebar appear without reopening the panel.

Applying copies the grade into the project. Updating a library preset does not retroactively change projects that used an earlier version. Saving a preset alone does not apply a grade to the current project. Library changes are separate from project undo/redo; project grade applications support normal undo/redo.

## AI and CLI

`capabilities.get` advertises `colorGradePresets`, `colorPresetWorkflow`, the action schemas and the available methods. Each preset includes its ID, name, grade and revision. Use the listed settings/IDs rather than recreating a named preset from memory.

The sidebar AI and external `actions.execute` support:

```json
{"id":"save-look","type":"saveGradePreset","name":"Personal","grade":{"enabled":true,"exposure":0.45,"temperature":0.1,"tint":-0.2,"contrast":1.15,"saturation":1,"shadows":0,"midtones":0,"highlights":0,"rolloff":0,"mask":null}}
```

```json
{"id":"apply-look","type":"applyGradePreset","presetId":"<listed-id>","sourceId":"<recording-clip-id>"}
```

For a layer override, supply `elementId` instead of `sourceId`. Exactly one target is required. To update an existing preset, `saveGradePreset` also needs `presetId` and `expectedPresetRevision`. After an action, observe fresh state and inspect the rendered result.

Direct CLI RPC methods, usable with `scripts/edity-agent.cjs call --descriptor <descriptor> --method <method> --params-file <file>`:

| Method | Parameters |
| --- | --- |
| `colorPresets.list` | `{}`; returns `{presets:[...]}` |
| `colorPresets.save` | `name`, `grade`, `idempotencyKey`; optional `presetId` and `expectedPresetRevision` for an update; returns `{preset:...}` |
| `colorPresets.apply` | `projectId`, fresh `expectedRevision`, `presetId`, exactly one `sourceId` or `elementId`, `idempotencyKey`; optional `expectedPresetRevision`; returns the normal project acknowledgement |

Library saves normalize and validate all grade settings, use atomic writes and reject stale updates. Retrying the same CLI request does not create duplicate presets. Text/audio targets and unknown sources are rejected. Older instruction/effect libraries remain readable and retain their existing entries.

## Verification

- 46 selected Node tests and 10 Python tests passed.
- Hidden packaged tests verified manual save/apply/update, an actual CLI subprocess, shared sidebar action execution, three projects, live refresh, stale revisions, retries, snapshot independence and reload persistence.
- Pixel checks verified that preset application changes the actual GPU output. Existing grading tests checked all nine controls, source/layer selection, masks, neutral parity and matching preview/capture/MP4 output.
- The final package also passed the full timeline mouse/keyboard tests for gain, fades, B/V splitting, independent halves, history and persistence. Splitting preserved rendered audio byte for byte.

Backend workflow version: **28**. Shared visual rendering and audio mixing are unchanged from v32. Validation used disposable projects; the user's projects and running app were not modified or restarted.

Evidence: `docs/media-implementation-evidence/color-presets-v33.json`.
