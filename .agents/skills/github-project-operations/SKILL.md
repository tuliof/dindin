---
name: github-project-operations
description: Reads and updates GitHub Project tasks through the repository helper, including status transitions, metadata, dependencies, and reconciliation.
user-invocable: false
---

# GitHub Project Operations

Use `bun scripts/github-project.ts`; statuses are `todo`, `in-progress`, `review`, or `done`. Use `ready`/`blocked`, not raw `gh` pipelines. Use `create`, `comment`, and `validate-delivery` for auditability. Project JSON is `{ items, totalCount }`, defaults to 30, and item IDs differ from issue numbers. Discover options dynamically. Drafts are not issues. Run `reconcile` after writes. `review` requires commit + PR; `done` requires QA + merge.
