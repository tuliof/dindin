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

## Session Lifecycle

Start the local daemon in a managed PTY and keep it alive for the review:

```text
hunk daemon serve
```

Start a review session in a second managed PTY from the repository root. Use the
exact review range needed by the task:

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
session IDs, and terminate both processes after the review handoff is complete.
Do not ask the user to open Hunk manually.

## Review Workflow

1. Start or reuse the daemon.
2. Start or reuse a session for the task's repository and branch diff.
3. Inspect structure before loading the full patch:

```text
hunk session review <session-id> --json
hunk session review <session-id> --json --include-patch
```

4. Add focused findings with Conventional Comments prefixes, for example:

```text
issue (blocking): This transition can leave the record without an owner.
suggestion (non-blocking): Extract this repeated status mapping.
question: Should excluded accounts be visible in this response?
```

5. Add one comment or apply a validated batch:

```text
hunk session comment add <session-id> --file src/example.ts --new-line 42 --summary "issue (blocking): ..."
printf '%s\n' '{"comments":[{"filePath":"src/example.ts","newLine":42,"summary":"issue (blocking): ...","author":"reviewer"}]}' | hunk session comment apply <session-id> --stdin
```

6. Read comments and preserve the complete output for the implementation handoff:

```text
hunk session comment list <session-id> --type all
```

The reviewer must report a local verdict of `approve` or `request-changes`.
Blocking findings require `request-changes`; non-blocking findings may still
be approved.

## Implementation Handoff

When review requests changes, the Scrum Master moves the project task back to
`in-progress` and delegates the implementation agent with the session ID and
the complete output of `hunk session comment list`. The implementation agent
must inspect every finding, make the necessary changes, and re-run the Hunk
review on the updated diff. Do not summarize or drop comments during this
handoff; the coder needs the original file, line, prefix, and rationale.

When review approves, leave the task in `review` until the later GitHub PR and
merge workflow is implemented.

## Safety

- Use explicit session IDs when sessions overlap.
- Keep the daemon loopback-only.
- Never expose Hunk remotely with `HUNK_MCP_UNSAFE_ALLOW_REMOTE=1`.
- Do not use raw GitHub commands for project status or review comments.
- Hunk comments are local review artifacts; do not commit them with product code.
- If a PTY or daemon dies, report the session failure and restart it before
  continuing rather than silently reviewing a different source.
