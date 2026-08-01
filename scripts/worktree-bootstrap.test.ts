import { describe, expect, test } from "bun:test";
import {
  assertBranchAvailable,
  assertCleanWorktree,
  assertPathAvailable,
  validateBranchName,
  validateRepositoryRoot,
  validateTaskName,
  validateWorktreeRequest,
} from "./worktree-bootstrap";

describe("worktree bootstrap validation", () => {
  test("accepts deterministic task and branch names", () => {
    expect(validateTaskName("plaid-link")).toBe("plaid-link");
    expect(validateBranchName("task/plaid-link")).toBe("task/plaid-link");
  });

  test("rejects unsafe task and branch names", () => {
    for (const task of ["Plaid-Link", "plaid_link", "../plaid", "plaid link"]) {
      expect(() => validateTaskName(task)).toThrow("Task name");
    }
    for (const branch of [
      "/task/plaid",
      "task//plaid",
      "task/../main",
      "task/main.lock",
    ]) {
      expect(() => validateBranchName(branch)).toThrow("Invalid task branch");
    }
  });

  test("refuses occupied and registered paths", () => {
    const worktrees = [{ branch: "main", path: "/tmp/dindin" }];
    expect(() => assertPathAvailable("/tmp", [])).toThrow("occupied");
    expect(() => assertPathAvailable("/tmp/dindin", worktrees)).toThrow(
      "registered"
    );
    expect(() =>
      assertPathAvailable("/tmp/dindin-task", worktrees)
    ).not.toThrow();
  });

  test("refuses invocation outside the repository root", () => {
    expect(() =>
      validateRepositoryRoot("/tmp/dindin/scripts", "/tmp/dindin")
    ).toThrow("repository root");
  });

  test("refuses a conflicting branch without creating a worktree", () => {
    expect(() =>
      assertBranchAvailable("task/plaid-link", ["task/plaid-link"])
    ).toThrow("already exists");
    expect(() =>
      validateWorktreeRequest({
        branch: "task/plaid-link",
        existingBranches: [],
        path: "/tmp/dindin-task-123",
        repositoryRoot: "/tmp/dindin",
        task: "plaid-link",
        worktrees: [{ branch: "task/plaid-link", path: "/tmp/other" }],
      })
    ).toThrow("already checked out");
  });

  test("refuses dirty cleanup and allows clean cleanup", () => {
    expect(() => assertCleanWorktree(" M scripts/example.ts\n")).toThrow(
      "dirty"
    );
    expect(() => assertCleanWorktree("")).not.toThrow();
  });
});
