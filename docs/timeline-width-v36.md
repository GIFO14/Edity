# Expand / restore timeline width

Build `timeline-width-v36`, based on delivered `media-inspector-v35`.

- The maximize icon at the right of the timeline toolbar, next to zoom, expands it across the video and transcript columns. The same button restores its normal width.
- The video and transcript remain visible above the expanded timeline. Media / AI panels remain beside the workspace.
- The existing viewer divider adjusts the top edge of the expanded timeline. The transcript's bottom follows that edge.
- The same video, timeline and transcript stay mounted. Width changes preserve selection, zoom, timeline scroll position and ongoing playback. Transcript scrolling continues to follow active speech during playback as before.
- Expansion is editor UI state. It starts off when a project loads and does not modify the composition, project history or export.

Implementation: `timelineWide` in the composition UI store toggles a workspace class. An observed timeline slot sets the shared top edge. CSS spans the existing timeline under both columns without portals or duplicate players. The timeline's layout effect retains its visible start fraction when its width changes.

Packaged verification covers native maximize/restore, keyboard activation, preserved DOM identities and paused transcript scroll, live playback across toggles, zoom/selection/scroll preservation, sidebar bounds, real fade dragging and undo, viewer divider movement, window resizing and a viewport below 900 px. The existing timeline editing regression suite also passes. Reports and release hash are in `docs/media-implementation-evidence/timeline-width-v36.json`.
