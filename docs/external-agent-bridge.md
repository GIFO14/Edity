# Edity external agent bridge — contract v1

Status: **implemented and verified; compatible desktop build available** (2026-10-06).
Owner of this side: CutScript/Edity. Video Reference owns the MCP client and its instructions.
No changes are made to VideoAnalysisPlugin or installed plugins from this repository.

## Transport and discovery

Edity owns an HTTP server bound **only to 127.0.0.1**, on an automatically allocated port.
Each running instance writes one UTF-8 JSON descriptor:

`%LOCALAPPDATA%/Edity/agent-bridge/instances/<instanceId>.json`

`EDITY_AGENT_BRIDGE_DIRECTORY` overrides the descriptor directory for an isolated session.
Descriptor shape:

```json
{"protocolVersion":1,"instanceId":"uuid","pid":1234,"startedAt":"ISO UTC", "url":"http://127.0.0.1:12345", "token":"random bearer secret", "mode":"desktop", "projectsRoot":"absolute path", "executable":"absolute path"}
```

The **client reads the token privately and never includes it in a tool result, prompt,
URL, screenshot or log**. Authenticate every request, including artifact fetches, with
`Authorization: Bearer <token>`. No browser origins are accepted. The descriptor is
removed when its owning instance closes. Discover clients by scanning descriptors
and verifying `instance.info`; ignore dead descriptors. A running older Edity build
without this bridge cannot be hot-connected. Do not restart the user's instance to
replace it; use a separate isolated session until they reopen the new build.

POST `/v1/rpc`, Content-Type `application/json`:

```json
{"id":"client-correlation-id","method":"projects.list","params":{"offset":0,"limit":50}}
```

Reply:

```json
{"id":"client-correlation-id","result":{"projects":[],"nextOffset":null}}
```

Failure:

```json
{"id":"client-correlation-id","error":{"code":"REVISION_CONFLICT","message":"Reload context before editing","details":{"actualRevision":7}}}
```

HTTP status: 400 invalid request, 401 authentication, 403 unsupported origin/forbidden
operation, 404 unknown method/project/job/session/artifact, 409 revision/idempotency
conflict, 422 invalid action/data, 500 internal failure. Tokens never appear in errors.

## Exact method names and parameters

All object parameters below are JSON objects. File paths are absolute local paths.
IDs are opaque; reuse returned IDs rather than inventing project, clip, word or asset IDs.

| Method | Parameters | Result |
| --- | --- | --- |
| `instance.info` | `{}` | Instance metadata without token, including mode, protocolVersion and projectsRoot. |
| `capabilities.get` | `{projectId?}` | Method names, action types, units, composition/action schemas, defaults, fonts, saved presets and agent instructions. |
| `projects.list` | `{offset?:0,limit?:50}` | `{projects,nextOffset}`. Limit at most 100. |
| `projects.open` | `{projectId,show?:false}` | `{document,jobs}`. `show` asks a desktop instance to open its editor tab; no UI in isolated mode. |
| `projects.create` | `{idempotencyKey,title?,mode:"reconciled"|"process",sources:[{path,sha256?,transcript?}],options?}` | `{projectId,jobId}` immediately; original inputs are copied/prepared in the background. |
| `projects.configure` | `{projectId,expectedRevision,idempotencyKey,changes}` | Commit acknowledgement; allowed changes are title, mediaFolders, aiSettings and instructionProfile. |
| `context.get` | `{projectId,sessionId?,wordOffset?:0,wordLimit?:200,includeComposition?:true,includeManifest?:true}` | Snapshot revision, paginated indexed words, removed indices, sound events, clips/source mapping, composition, manifest, instructions, references and session state. Word limit at most 500. |
| `sessions.open` | `{projectId,idempotencyKey}` | `{sessionId,projectId,revision}`. Persistent tool state for candidates, inspected resources, findings and artifacts. |
| `attachments.add` | `{projectId,expectedRevision,idempotencyKey,path,name?}` | `{attachment,revision}`. Managed reference stored in project history and portable archives. |
| `actions.execute` | `{sessionId,expectedRevision?,idempotencyKey,groupId?,action}` | `{jobId,status}`. Run one validated Edity action without asking another LLM. Mutating `import`/`edit` require expectedRevision. |
| `candidates.register` | `{sessionId,idempotencyKey,candidates:[{name,kind,path? ,url?,pageUrl?,license?}]}` | `{candidates}` with server-assigned IDs. Exactly one of path or url; URLs must be public HTTPS. |
| `jobs.get` | `{jobId}` | Persistent Edity job, including status/progress/result/error. Successful action result includes revision and visual artifacts. |
| `jobs.list` | `{projectId}` | `{jobs}`. |
| `jobs.cancel` | `{jobId}` | Cancelled job; owned child tasks/processes cancel through the coordinator. |
| `jobs.retry` | `{jobId}` | Resumed job; stable action/transaction IDs prevent duplicate edits. |
| `history.undo` | `{projectId,expectedRevision,idempotencyKey}` | Repository acknowledgement; same grouped history as the editor. |
| `history.redo` | `{projectId,expectedRevision,idempotencyKey}` | Repository acknowledgement. |
| `exports.prepare` | `{projectId,expectedRevision,idempotencyKey}` | `{snapshotId,revision,durationUs,canvas}`; freezes document+manifest for subsequent export. |
| `exports.start` | `{snapshotId,idempotencyKey,outputPath,kind?:"video",width?,height?,format?:"mp4",studioSound?:false,captions?:"none"}` | `{jobId,status}`. `kind:"resolve"` uses the same Resolve timeline exporter. |
| `instance.close` | `{}` | `{closing:true}`; **isolated sessions only**. Desktop instances reject it. |

### Reconciled import

`mode:"reconciled"` preserves the **original source timebase**. It does not remove
silences, invoke transcription, infer retakes, or apply unconfirmed candidate cuts.
Provide each source's raw transcript in original local-source microseconds:

```json
{"path":"D:/video.mp4","sha256":"64 hex characters","transcript":{"language":"en","segments":[{"startUs":1000000,"endUs":2500000,"text":"Hello world","words":[{"text":"Hello","startUs":1000000,"endUs":1500000,"confidence":0.98},{"text":"world","startUs":1600000,"endUs":2500000,"confidence":0.98}]}]}}
```

Sources remain in supplied order. Edity's existing preparation/concatenation worker
copies them, verifies supplied hashes and maps local timestamps into the continuous
base. Context returns actual clip IDs and original source index/path/hash plus each
clip's start offset. The IA decides edits from actual imported word IDs. Do not turn
`origin:transcript_candidate` into a confirmed precise cut automatically. Import the
Markdown editing script with `attachments.add`, then `readAttachment`.

`mode:"process"` uses the existing Edity silence/transcription pipeline and its saved
profile options. Its postprocessing timeline differs from original source times;
do not reuse original EDIT_MAP timestamps there without remapping.
For external imports, the optional internal CLI step that reorganizes transcription
paragraphs is skipped. Local ASR and sound detection remain available; this mode
therefore also avoids a secondary LLM request. Ordinary imports in the Edity UI keep
their existing transcription cleanup behavior.

## Same editing tools as internal AI

The action object conforms to `shared/media-action-schema.json` (`Action` definition).
Supported direct actions: `observe`, `searchLocal`, `import`, `edit`, `inspect`,
`inspectResource`, `readAttachment`, `done`.

Internal and external calls share one dispatcher, the project repository, coordinator,
word restoration/deletion helpers, visual selection guards and rendering pipeline.
An external call **does not invoke `/composition/ai-turn`** or the signed-in CLI.
For web search, the external Codex already has its own search tools: register verified
results with `candidates.register`, then inspect/import them through Edity. The internal
`searchWeb` action uses another Codex request and is therefore not advertised for direct
external execution. This is a client-search adaptation, not a second editor.

Action jobs expose the tool's data in `job.result.result`, the current `revision`, and
`visualInputs` with PNG artifact metadata. Fetch an image with authenticated GET
`/v1/artifacts/<artifactId>` or read its returned absolute local `path`. Artifact URLs
never contain the bearer token. Only registered artifacts may be fetched; there is
no arbitrary filesystem read/write endpoint.

### Time and preservation rules

- Action/editor times: integer microseconds; intervals `[startUs,endUs)`.
- Stored transcript words/clip starts: seconds; context additionally exposes local and
  global microsecond fields to make conversions explicit.
- `deleteRanges`/`restoreRanges`: inclusive indices in the **original word array**.
- Speech anchors use real `startWordId`/`endWordId`; numeric user playback times use
  timeline placements. Never mix these with original clip times or B-roll sourceInUs.
- Default B-roll inspection: 25% of its original resource duration. Ask other source
  times for changing or ambiguous content. Inspect visual candidates/assets before
  importing/selecting them; filenames alone are insufficient.
- Preserve speech and the supplied silence/join profile. Manifest computation and
  export reuse Edity's acoustic word-boundary refinement, margins and audio joins.
- Existing/manual edits remain unless the user requests their correction. Stable
  idempotency IDs and exact expectedRevision checks protect retry and concurrent edits.
- Do not add diagrams, camera overlays or B-roll already embedded in the recording.
- Support editable text, registered animation/transition presets, custom variants,
  transforms, borders, audio gain/fades/ducking, buses and restoration of marked words.
  No executable scripts, shaders, arbitrary code or unsupported effect imports.

## Lifecycle and verification

An isolated launcher and CLI client will be provided in this repository. It must use
its own projects/user-data/cache/backend port and descriptor directory, leave the
user's open Edity process untouched, and support deterministic shutdown of its own
instance. Tests create only disposable projects and compare the same dispatcher and
persisted revisions/undo against the internal editing path.

Implementation progress and verified commands/results will be appended here.

### Available build and launcher

Executable: `C:/Users/Martí/CutScript/dist/app/agent-bridge-v15/win-unpacked/Edity.exe`.
Launcher/client: `C:/Users/Martí/CutScript/scripts/edity-agent.cjs`.

```powershell
node C:/Users/Martí/CutScript/scripts/edity-agent.cjs launch --isolated-dir D:/Edity-QA/session
```

Choose an empty absolute directory (or an existing session created by this launcher).
It prints sanitized instance metadata and `descriptorPath`; it does **not** print the
token. Optional `--executable <absolute path>` and `--python <absolute path>` override
the bundled build and this repository's existing Python environment. User-data,
projects, media cache, local app-data, backend port and descriptors belong to that
isolated directory. Logs are `stdout.log` and `stderr.log` there. No desktop app is
closed or restarted. Repeat launch on a live session returns its existing descriptor.

```powershell
node C:/Users/Martí/CutScript/scripts/edity-agent.cjs discover --directory D:/Edity-QA/session/instances
node C:/Users/Martí/CutScript/scripts/edity-agent.cjs call --descriptor <descriptorPath> --method capabilities.get --params-file <jsonFile>
node C:/Users/Martí/CutScript/scripts/edity-agent.cjs close --descriptor <descriptorPath>
```

The client may also use authenticated HTTP directly, keeping the token private.
`context.get` returns fields directly at the top level: `projectId`, `revision`,
`words`, `wordCount`, `nextWordOffset`, `clips`, `composition`, `manifest`,
`attachments`, `candidates`, `results`, `visualInputs`. Words expose `index`, `id`,
global `startUs`/`endUs` and local-source `sourceStartUs`/`sourceEndUs`. Stored
`start`/`end` seconds remain present for compatibility. While preparation is pending,
`ready:false` and `manifest:null` let the client inspect progress without inventing an
editable final timeline.

Action results are asynchronous: poll `jobs.get`. On success, `job.result` contains
`sessionId`, `type`, `result` (the original tool data), `revision`, `done`,
`duplicate` and `visualInputs`. Failed jobs contain `error`, `errorCode` and optional
`errorDetails`. Each action is one undo group by default; optional `groupId` groups
several actions into a coherent user edit. Final chat summaries do not create an
extra undo step for external sessions. Reusing an idempotencyKey with changed
arguments is a conflict; use a fresh key for corrected arguments.

## Verified release

Desktop shortcut `C:/Users/Martí/Desktop/Edity.lnk` points to the compatible v15
executable. The user's existing Edity process was not closed or restarted. The bridge
appears on their next normal launch; an old running v14 instance does not have it.
The installed Video Reference 0.2.15 client has been coordinated and independently
tested through its actual MCP transport.

Verification in this repository:

- 37 Node tests plus 6 Python tests pass. These include the internal dispatcher,
  repository/grouped undo, coordinator, real loopback authentication/origin/host
  checks, private artifacts, canonical idempotency, exact expectedRevision during
  slow manifest computation, recovery after a journal commit with a lost tool
  checkpoint, normalized source timing and rejection of duplicate word IDs.
- TypeScript/Vite compilation passes. The packaged renderer preserves the delivered
  compositor/transition shader and v14 video/still-image decoder.
- Packaged HTTP e2e imports two actual short MP4 fixtures with supplied transcripts,
  preserves source hashes and word IDs, reads Markdown, applies/restores a word cut,
  rejects a stale revision, undoes/redoes, blocks uninspected visual import, inspects
  a resource, delivers authenticated PNG bytes, retries/imports it and places an
  overlay. MP4 export asserts its green pixel, 640×360 video and nonzero original
  audio. Frozen snapshots and Resolve timeline export pass. Closing/relaunching an
  isolated session recovers its project, session, inspected candidates and retry IDs.
- Final lifecycle verification rejects an incorrect hash with `HASH_MISMATCH`,
  returns error/pending context without an invented manifest, imports a correct
  source and closes/reopens without automatic editor tab loading.
- Independent Video Reference MCP e2e imports a 6.28 s excerpt with 18 actual ASR
  words, delivers real `ImageContent`, cuts a word, verifies dedup/conflict/undo,
  inspects/imports a PNG and exports an asserted red overlay with H.264/AAC. The
  original script and source recordings remain unchanged.

Portable evidence: `docs/media-implementation-evidence/external-agent-bridge-v15.json`.
Own packaged e2e: `D:/Edity-media-verification/agent-bridge-v15-release/report.json`.
Final lifecycle: `D:/Edity-media-verification/agent-bridge-v15-final/verification.json`.
Independent MCP result:
`C:/Users/Martí/Documents/ChatGPT/VideoAnalysisPlugin/test-output/edity-bridge-interop-run2/report.json`.

### Practical limits

- `context.get` with a manifest and `exports.prepare` may need the initial acoustic
  analysis after a new cut. Allow at least 120 seconds for these reads; use
  `includeManifest:false` for fast paginated transcript/context reads. Mutations are
  job-based and must not be blindly retried under a new identity.
- Only one tool may update a session at a time; `SESSION_BUSY` means wait for its
  existing job. Different projects can run through the coordinator's normal budgets.
- A stable action ID is immutable. Corrected arguments require a new action ID and
  idempotencyKey; JSON object key order alone does not change request identity.
- Reconciled import creates an unedited continuous base from sources in supplied
  order. It does not decide which candidate passages to retain, reorder the narrative
  or certify word boundaries. The agent must interpret the supplied guide and inspect
  uncertain cuts. Natural speech-join quality is inherited from Edity's existing
  acoustic engine; these integration tests are not a listening certification for the
  user's complete video.
- `kind:"resolve"` exposes the existing **base-cut** timeline exporter. It does not
  translate every Edity overlay/text/preset into native Resolve effects. Video export
  renders the complete Edity composition.
- Public media web search belongs to the external agent; verified URLs enter through
  `candidates.register`. Direct tools, reconciled import and external process imports
  do not ask a second LLM to edit or reorganize transcription.
- No arbitrary filesystem execution, raw IPC passthrough, manual keyframes, native
  DaVinci effect import or command/script execution is exposed.

## v16 normal-import and speech-membership extension (verified, 2026-10-07)

The v15 reconciled workflow above remains an explicit option, not the default for
normal editing. Clients must require this exact live capability before using the new
default workflow:

```json
{"workflow":{"normalImportUsesGlobalDefaults":true,"processCreatesFreshTranscript":true,"externalAgentDoesCleanup":true,"passageReordering":false,"clipReordering":false}}
```

New method `defaults.get` takes `{}` and returns the authoritative desktop defaults:
`{revision,processing:{preset,customMargin,engine,model,language},aiSettings:{editingInstructions,mediaInstructions,customFillerWords},mediaFolders,initialized,source}`.
`capabilities.get` also includes the snapshot as `projectDefaults`.

`projects.create` defaults to `mode:"process"` when omitted. Omitted options inherit
the same server-side defaults used by the manual import dialog; an empty aiSettings
object does not clear permanent instructions. This mode removes silence and makes a
fresh Edity transcript, without injecting raw ASR from a handoff. External Codex then
uses `context.get.cleanupInstructions` to remove retakes/fillers from those new word
IDs. There is no second internal editing LLM. `show` defaults to true on a desktop
instance; the project is immediately in that instance's normal project library.
Isolated instances still use a separate QA library.

`context.get` additionally supplies `globalDefaults`, `cleanupInstructions` (effective
project instruction strings and fillers), `sourceMaps` (original→silence-processed
clip coordinates plus continuous-base offset) and resolved anchor coverage. Original
recording/guide times must be reconciled through these maps and the new transcript,
not copied into edited-timeline placements.

Speech placements add optional `memberWordIds:string[]`. Edity captures the original
inclusive set when a new anchor is committed, even if the caller supplies only the
two endpoint IDs. An existing membership does not silently change when speech is
removed or clips disappear. Unknown/missing endpoints never fall back to unrelated
words. Preview and export apply these policies:

- Deleting earlier speech shifts the complete visual with its original members.
- Deleting an endpoint uses the first/last retained original member.
- Deleting interior members shortens the active coverage with the retained speech.
- Deleting all members suppresses the visual but preserves its object/IDs for undo.
- If members become separated by foreign content, coverage is split and the visual
  is absent over that content. Source/preset phase progresses through kept coverage
  and pauses over unrelated gaps.

Current desktop UI supports marking/restoring words and adding/removing whole source
clips; it does not implement passage or clip reordering. Layer dragging moves a
supplemental visual, not narration. Synthetic reordered manifests will be used to
verify safe anchor resolution, without presenting narration reordering as available.

### v16 clocks and constructors

- `context.words[].start/end` are seconds on the continuous, silence-processed base;
  `startUs/endUs` are the same global coordinates in microseconds.
- `sourceStartUs/sourceEndUs` are local coordinates in the CURRENT prepared clip.
  `timebase` identifies `processed-clip` or explicit `original-clip` imports.
- `originalSourceIntervals` contains zero or more `{startUs,endUs}` intervals in the
  original recording, calculated from the actual Auto-Editor timeline of the same
  import run. It can be `null` for older projects without a recorded timing map.
- Each `sourceMaps` entry provides `clipId`, `sourceIndex`, `originalPath`, optional
  `originalSha256`, `baseStartUs`, `processedDurationUs`, and `mapping`. The mapping's
  `segments` use `originalStartUs/originalEndUs/processedStartUs/processedEndUs`.
  No second silence analysis or guessed identity mapping is substituted.
- New speech constructors use `fallbackClock:"clip-local"`. The fallback describes
  only the selected portion of the FIRST clip when members span several clips.
  All members are still represented by `memberWordIds`. Old/global fallback hints
  are retained as data, but v16 does not use any fallback to assign speech coverage.
- `resolvedAnchors` is returned when `includeManifest:true`: each entry contains
  `elementId`, `memberWordIds`, `suppressed`, `startUs`, `endUs`, `activeSpans`
  (`startUs,endUs,elapsedUs`) and `activeDurationUs`. Without a manifest it is null.
- An offset belonging to a deleted endpoint is not transferred to the replacement
  member; it remains stored for undo. Explicit user changes to timing/selected words
  can reanchor a visual. Automatic speech cuts never rewrite the original membership.
- New manual text/image/B-roll additions link to the speech in their range when
  available. The inspector can link a legacy absolute placement, attach a selection
  or detach explicitly. Music retains its existing independent timing default.

### Configuration, lifecycle and activation

The authoritative file is `<Electron userData>/project-defaults.json`. Legacy persisted
desktop preferences migrate once through the workspace renderer. Import engine,
model and language choices now persist along with silence profile/margin, instruction
strings, custom fillers and media folders. Opening a project's instruction override
does not rewrite global defaults. Missing overrides inherit globals; explicit empty
instruction strings remain intentional.

`initialized:false` means bootstrap/migration is pending, not permission for the client
to invent options. `defaults.get` waits for initialization (up to 20 s). Values which
were not persisted by an older Edity version use the same built-in defaults that its
manual dialog used. Saved/initialized values always take precedence.

QA launcher:

```powershell
node C:/Users/Martí/CutScript/scripts/edity-agent.cjs launch --isolated-dir D:/Edity-QA/v16-session --defaults-file D:/Edity-QA/defaults.json
```

The seed file is read-only and copied into the isolated store. Example shape:

```json
{"revision":1,"processing":{"preset":"custom","customMargin":0.08,"engine":"whisperx","model":"tiny","language":"en"},"aiSettings":{"editingInstructions":"Keep the last complete take; remove only clear retakes/fillers.","mediaInstructions":"","customFillerWords":"uh, um"},"mediaFolders":{"image":"","broll":"","music":""}}
```

The default launcher executable and desktop shortcut are now
`C:/Users/Martí/CutScript/dist/app/normal-flow-v16/win-unpacked/Edity.exe`.
Opening that executable normally creates a desktop instance in the normal project
library, which Video Reference 0.2.16 can discover. A project in an isolated session
remains QA data and must not be presented as a production desktop project. The older
trial/baseline project is unchanged. No user instance was restarted by this work.

The backend advertises `workflowVersion:16`. A new app avoids reusing an incompatible
older backend by starting its own free loopback port, without stopping the old process.

### Verification and incidents

- 45 Node and 16 Python tests pass, including the default factory/migration,
  immutable membership, nominal 90–100→80–90 s movement, endpoints/interior/all
  removal, unknown endpoint safety, synthetic disjoint/reversed coverage, B-roll
  phase continuity, audio phase through gaps, exact silence mappings and CUDA device
  argument translation.
- Hidden packaged desktop QA exercises actual word selection, Mark and Ctrl+Z undo.
  It verifies both B-roll and editable text, their timeline coverage, GL pixels,
  native `capturePage` pixels, production PNG frames and full MP4 export. Gates wait
  for the current renderer manifest and native presentation; captures keep the QA
  window hidden. No computer-use session or real project is used.
- Nominal movement is asserted with an exact synthetic manifest. The native UI
  example's acoustic engine removed 10.22 s, so its 90–100 s visual moved to
  79.78–89.78 s. Endpoint coverage uses the current manifest and first surviving
  original member as its oracle, rather than comparing absolute starts across two
  differently refined manifests.
- Independent Video Reference MCP QA processed a real 126.9 s hook into 78.833 s
  after silence removal, generated 207 NEW WhisperX words and verified inherited
  global QA settings. External Codex cleanup retained 79 words, removing abandoned
  takes/false starts, and verified a first-take visual's suppression and undo.
  The original recordings and previous trial remain unchanged.
- WhisperX had two pre-existing Windows GPU problems exposed by this real workflow:
  it passed `cuda:0` instead of a device type plus index, and its pinned CTranslate2
  required cuDNN 8 while PyTorch supplied cuDNN 9. The arguments are corrected and
  `nvidia-cudnn-cu12==8.9.7.29` is scoped to Edity's virtual environment. Actual tiny
  GPU transcription/alignment succeeds on a real 6.28 s excerpt. The dependency
  requirement follows [the upstream faster-whisper compatibility notes](https://github.com/SYSTRAN/faster-whisper).
- A first QA fixture had no audio stream; a second bypassed the real playback
  controller. Both were corrected in the harness. A stale native screenshot was
  caught despite correct export/GL pixels; subsequent gates explicitly wait for the
  current manifest and compare the native bitmap. These incidents are recorded,
  not counted as successful UI runs.

Final evidence: `docs/media-implementation-evidence/normal-flow-v16.json`.
Native UI proof: `D:/Edity-media-verification/normal-flow-v16-ui7/report.json`.
Independent MCP normal import/cleanup:
`C:/Users/Martí/Documents/ChatGPT/VideoAnalysisPlugin/test-output/edity-normal-v16-real-hook/{report.json,cleanup-proof.json}`.

This verifies the normal workflow and anchor mechanics. It does not certify listening
quality or a complete production edit of the user's three-clip video. Narration/clip
reordering is still unavailable; safe disjoint coverage is tested synthetically.

## v17 narration arrangement (verified; desktop activation pending, 2026-10-07)

The open v16 desktop remains unchanged while the new build is prepared.
New exact methods:

| Method | Parameters | Result |
| --- | --- | --- |
| `narration.get` | `{projectId}` | `{revision,arrangement,orderedWordIds,clipboard}`. |
| `narration.move` | `{projectId,expectedRevision,idempotencyKey,wordIds,beforeWordId?:null,position?:"end"}` | Repository acknowledgement plus updated arrangement. `position:"start"` or a beforeWordId selects a destination. |
| `narration.cut` | `{projectId,expectedRevision,idempotencyKey,wordIds}` | Parks the selected source fragments, preserving original words/IDs and a cut clipboard for paste or undo. |
| `narration.paste` | `{projectId,expectedRevision,idempotencyKey,beforeWordId?:null,position?:"end"}` | Inserts the parked cut exactly once; a second paste is rejected. |
| `narration.copyText` | `{projectId,wordIds}` | `{text,wordIds}`; no audio mutation or duplicate voice. |

Arrangement is nondestructive and uses clip-local source partitions. Original
transcript indices, word IDs, source files and speech memberships are unchanged.
Moves relocate existing fragments instead of appending an additional occurrence.
Acoustic refinement still runs on chronological source cuts before their kept pieces
are assembled in the new edit order. Preview, video/audio export and Resolve export
consume that same ordered manifest.

Copy means copy text/reference in this release, clearly labelled in the UI. It does
not duplicate spoken audio. Explicit audio duplication would require distinct word
occurrence IDs and a separate visual-copy policy; it is not silently treated as move.
Cut/paste and move preserve one occurrence and use the existing revision/undo journal.
Destinations inside the moved selection and stale/unknown IDs are rejected.

The transcript is displayed in arrangement order, while its data-word-index remains
the original index. Selection and word-click seeking follow the displayed order.
Saved speech visuals follow their original members and remain absent over foreign
content, including a selection split across several positions.

Read-only global instruction recovery diagnostics will expose saved named/project
instruction candidates when a legacy migration produced empty defaults. No candidate
is applied automatically, and intentionally empty global instructions are preserved.

### Explicit acoustic cut boundaries

`edit.deleteRanges[]` additionally accepts optional `cutStartUs` / `cutEndUs` in the
**CURRENT global processed SOURCE base** (not edited playback time). They become the
existing `DeletedRange.cutStart/cutEnd` seconds and use the same boundary locks as the
desktop fine-tune controls. Values must be inside the prepared source and ordered.
For example `{startIndex:163,endIndex:178,cutStartUs:57740000}` retains the voiced
gap before the first marked word even when ASR omitted its words. No invented ASR
is inserted. Split/restore keeps only overrides on the surviving outside ends.
This is shared internal/external action dispatch; expectedRevision, idempotency and
the normal history journal still apply. Older v16 schema rejects these fields; its
existing UI Fine tune cut controls are available until the user activates v17.

Verified release: `dist/app/narration-v17/win-unpacked/Edity.exe`. Evidence: `docs/media-implementation-evidence/narration-v17.json`. Real UI move, cut/paste/undo, exact noncontiguous deletion, AAC playback across native EOF, ordered MP4/Resolve output and explicit voiced-gap boundaries pass in isolated QA. Existing user desktop/project data are untouched by QA. Open the updated normal shortcut after closing the older app to activate the new capabilities.

### Silence-cut provenance and acoustic review (v20)

`workflow.silenceCutProvenance` advertises `context.editBoundaries`, also supplied
to the internal media editor. `silenceRemovals[]` derives exact original removed
intervals from each persisted Auto-Editor source map, including processed clip-local
and global source positions, the per-side margin, and `editTimesUs[]` on the current
playback arrangement. The same helper drives transcript and timeline indicators.
An omitted manifest yields null playback positions; a deleted occurrence yields
an empty array. Missing legacy maps remain explicitly unavailable. New maps also
record original duration for terminal trims. `timelineCuts[]` describes later edit,
clip and narration discontinuities. Review these boundaries before exposing A-roll
at the end of B-roll or a zoom; the map is evidence, not a fixed editing style.

`soundEvents[].source === 'acoustic'` means measured audible audio outside indexed
words, with unclassified content. It is retained and can be reviewed through the
same `soundActions` and UI controls as PANNs events. Confidence indicates audible
signal, not certainty that it is a removable noise. `audioAnalysis.soundScans`
reports known partial/failed classification; null means old status unavailable.
Do not delete uncertain speech. New processing and manual sound scans include
this acoustic review, with a fallback when the classifier cannot load.

Visual inspection stays on demand: `inspect` samples the edited composition at
the requested playback time; `inspectResource` defaults to 25% of a resource's
duration and supports other source times. The Video Reference reference-analysis
workflow's every-two-seconds-plus-shot sampling is a separate process.


## Reusable color presets (v33)

The shared sidebar/CLI library exposes `colorPresets.list`, `colorPresets.save` and `colorPresets.apply`, plus `saveGradePreset` / `applyGradePreset` actions. Read `capabilities.colorGradePresets` for IDs, saved settings and revisions. See [color-grading-presets-v33.md](color-grading-presets-v33.md) for parameter contracts, examples and verification. Applications copy a project snapshot; updating a shared preset does not alter existing videos.
