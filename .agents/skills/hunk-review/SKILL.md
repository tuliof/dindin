---
name: hunk-review
description: Runs and manages agent-owned Hunk review sessions, inspects diffs, and records inline review comments for implementation handoffs.
user-invocable: false
---

# Agent-Managed Hunk Review

Hunk is the local review workspace for this project. The Scrum Master owns the
daemon and review-session lifecycle; reviewer and implementation agents use
the session CLI to inspect and exchange comments without requiring a human to
operate the TUI.

## Source Identity Contract

Every review must be tied to the implementation agent's explicit worktree, not
to an inferred repository path or whichever checkout happens to be current.
Before reviewing, record and verify all of the following:

- The absolute implementation worktree path.
- The implementation branch name and expected `HEAD` commit, or the explicitly
  agreed working-tree state when the implementation is uncommitted.
- The Hunk session ID and the session's `Path`, `Repo`, and `Source` values.

The reviewer must confirm that the Hunk session source, current worktree, branch,
and expected `HEAD` identify the implementation under review. A Hunk session
must not silently switch sources. Do not use `reload --source`, change branches,
or continue after a daemon/session restart unless the new source identity is
explicitly re-verified and handed off. If identity cannot be verified, stop and
report the mismatch instead of reviewing a different checkout.

## Session Lifecycle

Start the local daemon in a managed PTY and keep it alive for the review:

```text
hunk daemon serve
```

Start a review session in a second managed PTY from the implementation agent's
explicit worktree. Use the exact review range needed by the task:

```text
hunk diff main...feature/my-task
```

Wait until the session is registered, then select it by its explicit session ID
when more than one session exists:

```text
hunk session list --json
hunk session get <session-id> --json
```

The Scrum Master must launch these processes with PTY support, retain their
session IDs, and hand off the worktree path, branch, expected `HEAD`, and session
ID to QA. QA must use that same worktree and session; it must not create a
checkout, switch branches, or substitute a local diff. The Scrum Master must
terminate both processes after the review handoff is complete.
Do not ask the user to open Hunk manually.

## Review Workflow

1. Receive the implementation worktree path, branch, expected `HEAD`, and Hunk
   session ID from the implementation handoff.
2. Start or reuse the daemon without changing the session source.
3. Run `hunk session get <session-id> --json` and verify `Path`, `Repo`, and
   `Source` against the handoff and the implementation worktree's branch/`HEAD`.
4. Inspect structure before loading the full patch:

```text
hunk session review <session-id> --json
hunk session review <session-id> --json --include-patch
```

5. Keep QA read-only with respect to the implementation worktree and source:
   inspect files and run validation only; do not edit implementation or test
   files, checkout or reset, stash, commit, push, or otherwise rewrite the
   worktree. Hunk session comment commands are the allowed review artifact.
6. Add focused findings with Conventional Comments prefixes, for example:

```text
issue (blocking): This transition can leave the record without an owner.
suggestion (non-blocking): Extract this repeated status mapping.
question: Should excluded accounts be visible in this response?
```

7. Add one comment or apply a validated batch:

```text
hunk session comment add <session-id> --file src/example.ts --new-line 42 --summary "issue (blocking): ..."
printf '%s\n' '{"comments":[{"filePath":"src/example.ts","newLine":42,"summary":"issue (blocking): ...","author":"reviewer"}]}' | hunk session comment apply <session-id> --stdin
```

8. Read comments and preserve the complete output for the implementation
   handoff:

```text
hunk session comment list <session-id> --type all
```

The reviewer must report the source identity and a local verdict of `approve` or
`request-changes`.
Blocking findings require `request-changes`; non-blocking findings may still
be approved.

## Implementation Handoff

When review requests changes, the Scrum Master moves the project task back to
`in-progress` and delegates the original implementation agent with the same
absolute worktree path and Hunk session ID, plus the complete output of
`hunk session comment list --type all`. The coder must work in that same
worktree, address every finding, and re-run the same Hunk session review on the
updated diff. Do not summarize, copy into another session, or drop comments
during this handoff; the coder needs the original file, line, prefix, and
rationale in the shared Hunk session.

When review approves, leave the task in `review` until the later GitHub PR and
merge workflow is implemented.

## Safety

- Use explicit session IDs when sessions overlap.
- Treat the implementation worktree, branch, expected `HEAD`, and Hunk session
  ID as one stable review identity.
- Keep QA read-only against the implementation worktree; comments may be added
  only to the designated Hunk session.
- Keep the daemon loopback-only.
- Never expose Hunk remotely with `HUNK_MCP_UNSAFE_ALLOW_REMOTE=1`.
- Do not use raw GitHub commands for project status or review comments.
- Hunk comments are local review artifacts; do not commit them with product code.
- If a PTY or daemon dies, report the session failure and restart it only after
  re-verifying the same worktree, branch, expected `HEAD`, and Hunk session
  source. Never silently review a different source.
