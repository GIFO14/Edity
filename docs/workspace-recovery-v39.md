# Workspace reopening recovery

Build `workspace-recovery-v39`, scoped over delivered `seek-recovery-v38`.

## Faults reproduced

The shell's Reopen button called the ordinary open path. Both the shell and main process deduplicated pending opens, so a stalled navigation could keep returning the same unresolved promise. Existing unresponsive views were also reused, and a later layout could reattach the failed view. The placeholder continued to say Opening even when a previously ready native view was absent.

The baseline packaged tests reproduce these failures. This does not establish which lifecycle event triggered every spontaneous disappearance in the user's session; the recovery paths themselves were demonstrably ineffective.

## Changes

- Reopen explicitly requests a fresh native view and bypasses both pending-open caches. Obsolete opening requests are cancelled and cannot close or replace their successors.
- A responsive old editor receives a synchronous beforeunload snapshot flush before replacement. That preparation has a 500 ms bound, so an unresponsive renderer cannot block recovery indefinitely.
- Navigation has a 20 second deadline and an error state with a working retry. Test instances shorten the deadline to 1.8 seconds.
- Failed and initially loading views remain detached, preserving access to the shell's recovery controls. Initial native bounds are nonzero for virtualized transcript layout.
- The selected project and its placeholder become visible while opening. A previously ready but absent editor has an explicit recovery message rather than an indefinite Opening label.

Saved projects and background processing remain in the main process. The playback, audio, timeline, shaders and export implementation are unchanged from v38.

## Verification

Hidden packaged tests use separate projects, user data and backend ports. The final recovery run clones the user's current full AI Code Review project and references its media; the source metadata hash is unchanged.

- An unresponsive native view stays detached through layout, and the actual shell Reopen button replaces its webContents.
- A pending beforeunload snapshot is persisted; words, removals and composition remain identical.
- A deliberately stalled snapshot preparation cannot hold recovery: the full real editor returns in 1,877 ms.
- A held navigation is superseded through the actual Reopen button despite both open caches.
- A held navigation times out, displays an error and successfully reopens.
- Project switching remains usable after recovery.
- Existing native regressions cover cancellation during opening, automatic renderer crash recovery, React error recovery, split view, tab close and reopen, saved content and bounded diagnostics.

Evidence and the final package hash are in `media-implementation-evidence/workspace-recovery-v39.json`. The desktop shortcut and CLI fallback select v39. The user's running app is not restarted by delivery.
