---
name: github-project-operations
description: Reads and updates GitHub Project tasks through the repository helper, including status transitions, metadata, dependencies, and reconciliation.
user-invocable: false
---

# GitHub Project Operations

Use `bun scripts/github-project.ts`; statuses are exactly `todo`, `in-progress`, `review`, or `done`. Use `ready` or `blocked --agent be|fe|qa` instead of raw `gh` pipelines. Project JSON is `{ items, totalCount }`, defaults to 30 items, and uses item IDs distinct from issue numbers. Discover field options dynamically. Drafts are not repository issues. After writes, run `reconcile`. Project writes require the `project` scope. Use `review` for QA handoff and `done` only after QA approval.
