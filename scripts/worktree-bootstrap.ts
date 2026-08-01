#!/usr/bin/env bun

import { existsSync, lstatSync, mkdirSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_BASE_REF = "origin/main";
const DEFAULT_PARENT_NAME = "dindin-wt-tasks";
const TASK_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BRANCH_PATTERN = /^[A-Za-z0-9._/-]+$/;

declare const Bun: {
  spawn: (
    args: string[],
    options: {
      cwd?: string;
      stderr: "pipe";
      stdout: "pipe";
    }
  ) => {
    exited: Promise<number>;
    stderr: ReadableStream<Uint8Array>;
    stdout: ReadableStream<Uint8Array>;
  };
};

export interface WorktreeRecord {
  branch: string;
  path: string;
}

export interface WorktreeRequest {
  branch: string;
  existingBranches: string[];
  path: string;
  repositoryRoot: string;
  task: string;
  worktrees: WorktreeRecord[];
}

function fail(message: string): never {
  throw new Error(message);
}

export function validateTaskName(task: string): string {
  if (!TASK_NAME_PATTERN.test(task)) {
    fail("Task name must use lowercase letters, numbers, and single hyphens");
  }
  return task;
}

export function validateBranchName(branch: string): string {
  if (
    !BRANCH_PATTERN.test(branch) ||
    branch.startsWith("/") ||
    branch.endsWith("/") ||
    branch.includes("..") ||
    branch.includes("//") ||
    branch.endsWith(".") ||
    branch.endsWith(".lock")
  ) {
    fail(`Invalid task branch name: ${branch}`);
  }
  return branch;
}

export function validateRepositoryRoot(
  currentDirectory: string,
  expectedRoot: string
): void {
  const current = resolve(currentDirectory);
  const root = resolve(expectedRoot);
  if (current !== root) {
    fail(`Run this helper from the repository root: ${root}`);
  }
}

export function assertPathAvailable(
  path: string,
  worktrees: WorktreeRecord[]
): void {
  if (existsSync(path)) {
    fail(`Worktree path is already occupied: ${path}`);
  }
  const normalizedPath = resolve(path);
  const conflict = worktrees.find(
    (worktree) => resolve(worktree.path) === normalizedPath
  );
  if (conflict) {
    fail(`Worktree path is already registered: ${path}`);
  }
}

export function assertBranchAvailable(
  branch: string,
  existingBranches: string[]
): void {
  if (existingBranches.includes(branch)) {
    fail(`Task branch already exists: ${branch}`);
  }
}

export function validateWorktreeRequest(request: WorktreeRequest): void {
  validateTaskName(request.task);
  validateBranchName(request.branch);
  assertPathAvailable(request.path, request.worktrees);
  assertBranchAvailable(request.branch, request.existingBranches);
  const branchConflict = request.worktrees.find(
    (worktree) => worktree.branch === request.branch
  );
  if (branchConflict) {
    fail(`Task branch is already checked out: ${request.branch}`);
  }
}

export function assertCleanWorktree(status: string): void {
  if (status.trim() !== "") {
    fail("Refusing to remove a dirty worktree");
  }
}

async function runGit(args: string[], cwd: string): Promise<string> {
  const child = Bun.spawn(["git", ...args], {
    cwd,
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) {
    fail(stderr.trim() || stdout.trim() || `git exited with code ${exitCode}`);
  }
  return stdout.trim();
}

async function repositoryRoot(currentDirectory: string): Promise<string> {
  const root = await runGit(["rev-parse", "--show-toplevel"], currentDirectory);
  validateRepositoryRoot(currentDirectory, root);
  return resolve(root);
}

async function listWorktrees(
  repositoryRootPath: string
): Promise<WorktreeRecord[]> {
  const output = await runGit(
    ["worktree", "list", "--porcelain"],
    repositoryRootPath
  );
  const records: WorktreeRecord[] = [];
  let currentPath: string | undefined;
  for (const line of output.split("\n")) {
    if (line.startsWith("worktree ")) {
      currentPath = line.slice("worktree ".length);
      continue;
    }
    if (line.startsWith("branch refs/heads/") && currentPath) {
      records.push({
        branch: line.slice("branch refs/heads/".length),
        path: currentPath,
      });
      currentPath = undefined;
    }
  }
  return records;
}

async function listBranches(repositoryRootPath: string): Promise<string[]> {
  const output = await runGit(
    ["for-each-ref", "--format=%(refname:short)", "refs/heads"],
    repositoryRootPath
  );
  return output ? output.split("\n") : [];
}

function parentPath(repositoryRootPath: string): string {
  return join(dirname(repositoryRootPath), DEFAULT_PARENT_NAME);
}

function uniqueWorktreePath(
  parent: string,
  task: string,
  suffix: string
): string {
  return join(parent, `${task}-${suffix}`);
}

function parseOptions(args: string[]): Map<string, string> {
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument?.startsWith("--")) {
      fail(`Unexpected argument: ${argument ?? ""}`);
    }
    const key = argument.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      fail(`Missing value for --${key}`);
    }
    options.set(key, value);
    index += 1;
  }
  return options;
}

async function createWorktree(options: Map<string, string>): Promise<void> {
  const currentDirectory = resolve(process.cwd());
  const root = await repositoryRoot(currentDirectory);
  const task = validateTaskName(options.get("task") ?? fail("Missing --task"));
  const branch = validateBranchName(options.get("branch") ?? `task/${task}`);
  const parent = resolve(options.get("parent") ?? parentPath(root));
  const suffix = options.get("id") ?? `${Date.now()}-${process.pid}`;
  if (!isAbsolute(parent)) {
    fail("--parent must be an absolute path");
  }
  const path = uniqueWorktreePath(parent, task, suffix);
  const worktrees = await listWorktrees(root);
  const existingBranches = await listBranches(root);
  validateWorktreeRequest({
    branch,
    existingBranches,
    path,
    repositoryRoot: root,
    task,
    worktrees,
  });
  await runGit(["fetch", "origin"], root);
  const baseSha = await runGit(
    ["rev-parse", `${DEFAULT_BASE_REF}^{commit}`],
    root
  );
  if (existsSync(parent) && !lstatSync(parent).isDirectory()) {
    fail(`Worktree parent is not a directory: ${parent}`);
  }
  mkdirSync(parent, { recursive: true });
  await runGit(["worktree", "add", "-b", branch, path, DEFAULT_BASE_REF], root);
  console.log(JSON.stringify({ baseSha, branch, path, task }, null, 2));
}

async function cleanupWorktree(options: Map<string, string>): Promise<void> {
  const root = await repositoryRoot(resolve(process.cwd()));
  const pathValue = options.get("path") ?? fail("Missing --path");
  const path = resolve(pathValue);
  if (path === root) {
    fail("Refusing to remove the repository root");
  }
  const worktrees = await listWorktrees(root);
  const record = worktrees.find((worktree) => resolve(worktree.path) === path);
  if (!record) {
    fail(`Path is not a registered worktree: ${path}`);
  }
  const status = await runGit(
    ["status", "--porcelain", "--untracked-files=all"],
    path
  );
  assertCleanWorktree(status);
  await runGit(["worktree", "remove", path], root);
  console.log(
    JSON.stringify({ branch: record.branch, path, removed: true }, null, 2)
  );
}

async function main(): Promise<void> {
  const [command = "create", ...args] = process.argv.slice(2);
  const options = parseOptions(args);
  if (command === "create") {
    await createWorktree(options);
    return;
  }
  if (command === "cleanup") {
    await cleanupWorktree(options);
    return;
  }
  fail(
    `Usage: ${basename(process.argv[1] ?? "worktree-bootstrap.ts")} {create|cleanup}`
  );
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
