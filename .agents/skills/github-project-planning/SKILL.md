---
name: github-project-planning
description: Translates requirements and PRDs into focused GitHub Project tasks with consistent wording, acceptance criteria, dependencies, ownership, and metadata.
user-invocable: true
---

# GitHub Project Planning

Create focused product or SDLC-improvement tasks, preferably `S`/`M`; use grouping parents for larger work. Include an imperative title, scope, context, testable acceptance criteria, out-of-scope items, dependencies, references, owner, labels, priority, size, and status. Supported statuses are `todo`, `in-progress`, `review`, `done`, and `blocked`. Use `blocked` only when a human decision is required. When blocking, use `move --status blocked --body` to record a comment with `## Question`, concrete `## Options`, and a `## Recommendation`; do not use the lane for implementation details or ordinary dependency sequencing. Inspect dependency links with `dependency-blocked`. Improvement tasks record source task/agent, evidence, impact, and outcome. Use observable behavior, check duplicates, split unrelated work, and never include secrets or private data.
