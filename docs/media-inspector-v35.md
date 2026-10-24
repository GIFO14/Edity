# Media inspector

Build `media-inspector-v35`, based on the delivered `viewer-text-v34`.

## Selection and navigation

- Selecting a timeline layer shows only that layer's inspector. A normal base-video click now also selects the base inspector while retaining scrubbing and locked base clips.
- The header names the inspected layer. Its back arrow clears selection and returns to project media.
- Tabs are contextual: Video / Image / Text, Audio, Color, Effects, Transition and File. Unsupported tabs are omitted.
- Without a selected layer, Layers provides the layer list and import tools. Color exposes source grading; Mixer exposes project buses and master gain.

## Organization

- Compact paired position, size, zoom and anchor fields; separate collapsible Transform, Cropping and Composite sections.
- Text content and common typography come first. Stroke / shadow and font imports are folded away.
- Selected audio shows bus, gain, fades, mute and ducking. Base voice controls explicitly apply across base recording cuts.
- Each applied effect has its own collapsible section. Preset browsing and saved variants remain available.
- Transitions are filtered to those entering or leaving the selected layer. Timing, speech anchors, source replacement and element management are in File.
- Project recordings, folders, analyzed library, imported files and background jobs remain available in folded project sections.
- Long explanatory paragraphs were removed from routine controls. Color preset saving is folded below the preset chooser.

## Persistence and scope

Selected-layer color changes create a layer override, including when applying a saved preset. They cannot silently alter another layer or its shared media source. Project Color retains source-wide grading. Existing preset storage, AI / CLI actions, composition schema, rendering, export and audio engines are unchanged.

Edits continue through composition transactions and project history. Numeric drafts accept negative and decimal values. Saving a pending field only clears that same draft, preserving a newer draft from a selection change.

Verification and release hashes are recorded in `docs/media-implementation-evidence/media-inspector-v35.json`.
