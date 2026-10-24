# Media editing reference from the user's Resolve projects

Reviewed on 2026-09-30 through Computer Use in the running DaVinci Resolve 20 application. This document records observed examples and the resulting requirements for Edity. The project values below are reference samples for verification, not fixed editing rules or mandatory presets.

## Scope and evidence limits

- Inspected Timeline 1 in Untitled Project 19 (AI videos) and Untitled Project 30 (Minecraft).
- Inspected representative clips, inspector settings, timeline structure, keyframe navigation and scrubbed compositions. This was not a complete frame-by-frame or listening review of both finished videos.
- Project 19's main recording is offline. Its editing structure and multiple supplementary assets remain inspectable. An offline main recording sometimes appears through a supplementary clip during its fade.
- Project 30's gameplay and sampled supplementary assets display correctly.
- Navigation and selection were used to inspect the existing projects. No project content was intentionally edited or relinked.

## Untitled Project 19: AI video

Observed structure:

- Timeline duration displayed as 00:14:18:49.
- V1 reports 232 clips, with linked speech on A1. The missing main recording is named 2026-08-18 19-15-41_ALTERED.mp4.
- V2 reports 36 clips, including supplementary recordings and explanatory visuals. V3 reports 4 clips and includes logo images.
- Supplementary visuals cluster in the opening portion and near the end, with a longer stretch of the main recording between them.
- Media Pool contains purpose-specific explanatory assets including 01_useful_not_factory.mp4, observability diagrams, workflow illustrations and product logos.
- At timeline time 01:00:56:40, 01_useful_not_factory.mp4 displays a software-factory comparison diagram. Its inspector shows normal compositing and opacity 72.52 at that sampled instant. Fade handles are visible. This instantaneous value must not be treated as constant opacity for the whole asset.
- Around 01:12:19:00, a Grafana logo fills the viewer; the library also contains an OpenTelemetry image.
- The opening music clip is Down With Your Getup - Mini Vandals.mp3 on A2. Its inspector shows volume -37.0; the timeline displays an extended fade-out near its end.

Interpretation for this sample: supplementary visuals explain the spoken content; timing, readable diagrams, relevant asset selection and restrained audio are useful style controls. The missing recording limits assessment of the complete visual result.

## Untitled Project 30: Minecraft video

Observed structure:

- Timeline duration displayed as 00:10:47:51.
- V1 reports 22 gameplay clips, with linked speech/gameplay audio on A1.
- V2 reports 11 clips and contains short titles and a web recording. Higher video layers contain a transparent logo and an animated notification asset.
- Additional audio layers include the web recording's audio, background music and notification audio. Supplementary video audio is therefore independently controllable and is not universally muted.
- A3 contains three successive portions of [9] ProleteR - April showers(1).mp3. A sampled middle portion has inspector volume -25.0.

### Editable text and motion

- A short title reads BlueMap; another reads URL Custom Disks. Both sampled titles use Montserrat Black / Black, white text and font size 234.
- BlueMap is positioned in the lower-left corner of the composed video and lasts approximately two seconds.
- Its Title controls include black outside-only stroke of size 16 and black drop shadow, with sampled offsets X=10 and Y=-21.
- Its Settings transform shows linked zoom X/Y=0.680 and position X=-630, Y=-449 at a sampled steady instant.
- The Title's own linked zoom is animated: 0.600 at 01:00:05:33, 0.900 at 01:00:05:37, and the smaller settled appearance at 01:00:05:39. These sampled keyframes establish a rapid grow/overshoot/settle entry. The exact interpolation curve and all exit behavior were not reconstructed.
- Font styling/layout and whole-element transform are distinct controls in this project. Edity can present simpler controls while preserving equivalent expressive power.

### Simultaneous layers

At 01:01:05:56 the viewer shows gameplay behind a web recording, with a separate transparent LumeServers logo above it:

- scroll pagina lume servers.mov: linked zoom 0.750, position X=-209, Y=-100; sampled rotation, pitch and yaw are zero.
- logo sencer lumeservers transparent.png: linked zoom 0.720, position X=-261, Y=1470 in Resolve's inspector coordinate system. These raw values should not be copied into Edity without coordinate conversion; the viewer is the visual reference.
- notificacio promo lume 2026.mov is a separate animated promotional notification. At 01:03:35:22 it displays in the upper-right corner over gameplay, with an accompanying audio clip visible on A4.

Edity must support multiple simultaneous visual layers, image transparency and video alpha, rather than replacing the entire frame whenever a B-roll item is present.

### Custom transition

- A transition at the early gameplay cut is named Xir_Ver_Arb_v4.
- Inspector duration is 0.5 seconds / 30 frames.
- Scrubbing reveals a strong vertical smear/blur during the transition.
- Opening it in Fusion shows a named macro connected to MediaOut1. Its internal parameters are not exposed in the inspected macro panel. The interface also reports DirectionalBlur1.
- This establishes the need for directional motion/blur transition capabilities and reusable parameterized presets. It does not establish direct compatibility of this Fusion macro with Edity.

## Preset workflow correction and Favorites inventory

The user clarified that Edity's editing workflow should select and customize presets, using their current Resolve Effects Favorites as the reference catalog. A manual keyframe editor is not part of the requested interface. Internal motion curves may implement presets, but users and the in-app AI work with preset identities and their supported parameters.

Favorites observed through Computer Use:

- Titles: Text; Dark Box Text Lower Third.
- Effects: Gaussian Blur; Camera Shake; 3D Keyer.
- Seamless Diagonal: Xir_Dia_Ab_Dr_v4, Xir_Dia_Ab_Iz_v4, Xir_Dia_Ar_Dr_v4, Xir_Dia_Ar_Iz_v4.
- Seamless Horizontal: Xir_Hor_Drch_v4, Xir_Hor_Izq_v4.
- Seamless Radial: Xir_Rad_AHor_v4, Xir_Rad_Hor_v4.
- Seamless Vertical: Xir_Ver_Arb_v4.
- Seamless Zoom: Xir_Zoom_v4.

The local original transition bundle was located at `C:\Users\Martí\AppData\Roaming\Blackmagic Design\DaVinci Resolve\Support\Fusion\Templates\Edit\Transitions\XIROCA Transiciones.drfx`. Its archive contains the original `.setting` definitions for all ten observed favorite transitions. Additional variants in the bundle are not automatically part of the requested catalog.

The vertical favorite's original definition was read without modifying it. It combines two source transforms, an exponential movement curve normalized to transition duration, a blend around the midpoint and directional blur peaking near that midpoint. These are concrete references for recreating the preset's behavior and testing visual parity. They do not imply the Fusion package is directly executable in Edity.

Expose meaningful supported controls per preset, such as duration, direction, amount/strength or entry/exit sizes. Controls must match the implemented effect; do not display parameters that have no effect. Permit saving a customized preset. The AI chooses and adjusts presets according to project instructions.

## Requirements for the shared editing engine

1. A serializable composition with asset references, visual layers, independent audio layers, ordering, source in/out and timeline placement. Allow arbitrary layer combinations and multiple items of the same type.
2. Editable text with installed font selection, weight, color, alignment, anchor, stroke, shadow and optional background. Text must remain editable after AI creation.
3. Whole-element transforms for the main recording and supplementary visuals: position, independent/linked scale, anchor, rotation, crop, opacity and perspective (pitch/yaw). Perspective is a requested capability; nonzero pitch/yaw was not confirmed in the sampled clips.
4. Parameterized animation and effect presets, permitting overshoot, settlement, movement and fades. Present preset selection and meaningful controls to both the user and AI. Any internal curves or generated keyframes remain implementation details rather than manual editing requirements.
5. Explicit clip-to-clip transitions with duration, alignment, direction and effect parameters. Keep voice timing deliberate when arranging overlaps; do not silently remove spoken material to make a visual transition fit.
6. Transparent PNG and alpha-video overlays, plus full-frame or partial-frame B-roll. Preserve aspect ratio and permit manual composition.
7. Independent audio inclusion, mute, trim, gain and volume envelopes/fades for music, supplementary recordings and sound effects. Support dB in user-facing controls. Automatic voice ducking is a separate proposed capability, not something verified in these projects.
8. A common definition of timing, layout and motion for preview and export, including consistent font metrics. Validate both against the same reference compositions.
9. Transcript/source anchors for additions so further speech cleanup does not unexpectedly displace related text or B-roll. Define how an anchor behaves if its associated phrase is removed.
10. AI operations to add, change, move and remove composition elements as an undoable edit. Give the AI the current composition, transcript, analyzed asset catalog and supported capabilities.

## Interaction and style policy

- Keep the transcript tall. Use a compact timeline below the video and expandable tracks within the video area.
- Manipulate appearance directly in the viewer, timing in the timeline, and detailed properties in the existing side panel. Link selection across these surfaces.
- Use the observed Favorites catalog for the initial transition/effect selection. Customize presets through their supported controls and allow reusable saved variants.
- User instructions govern media selection, pace, text density, placement, animation intensity, transitions and music. AI and Minecraft are examples of different preferences, not two hardcoded video modes.
- Validate a flexible composition engine first using the observed examples: explanatory diagram with fade; gameplay + web capture + transparent logo; outlined/shadowed text with a grow/overshoot/settle entry; alpha-video notification; independent background music; short directional-blur transition.
- Use the located original XIROCA definitions as reference for rebuilding the favorite transitions. Verify visual parity in preview and export before claiming an exact match.
