#!/usr/bin/env bun

type JsonRecord = Record<string, unknown>;

declare const Bun: {
  spawn: (
    args: string[],
    options: { stderr: "pipe"; stdout: "pipe" }
  ) => {
    exited: Promise<number>;
    stderr: ReadableStream<Uint8Array>;
    stdout: ReadableStream<Uint8Array>;
  };
};

const DEFAULT_OWNER = "tuliof";
const DEFAULT_PROJECT = "2";
const DEFAULT_REPOSITORY = "tuliof/dindin";
const STATUS_NAMES = ["todo", "in-progress", "review", "done"] as const;

type StatusName = (typeof STATUS_NAMES)[number];

const projectNumber = process.env.GITHUB_PROJECT ?? DEFAULT_PROJECT;
const projectOwner = process.env.GITHUB_PROJECT_OWNER ?? DEFAULT_OWNER;
const repository = process.env.GITHUB_REPOSITORY ?? DEFAULT_REPOSITORY;

function fail(message: string): never {
  throw new Error(message);
}

function parseArgs(args: string[]): {
  command: string;
  options: Map<string, string>;
} {
  const [command = "summary", ...rest] = args;
  const options = new Map<string, string>();

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (!argument?.startsWith("--")) {
      fail(`Unexpected argument: ${argument ?? ""}`);
    }

    const key = argument.slice(2);
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) {
      fail(`Missing value for --${key}`);
    }

    options.set(key, value);
    index += 1;
  }

  return { command, options };
}

async function runGh(args: string[]): Promise<string> {
  const child = Bun.spawn(["gh", ...args], {
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  if (exitCode !== 0) {
    fail(stderr.trim() || stdout.trim() || `gh exited with code ${exitCode}`);
  }

  return stdout.trim();
}

async function runJson<T>(args: string[]): Promise<T> {
  const output = await runGh(args);
  try {
    return JSON.parse(output) as T;
  } catch {
    fail(`Expected JSON from gh, received: ${output}`);
  }
}

function print(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function normalizeStatus(value: string): StatusName {
  if (!STATUS_NAMES.includes(value as StatusName)) {
    fail(`Invalid status "${value}". Use: ${STATUS_NAMES.join(", ")}`);
  }
  return value as StatusName;
}

function normalizeOption(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "-");
}

async function projectItems(): Promise<JsonRecord[]> {
  const response = await runJson<{ items?: JsonRecord[] }>([
    "project",
    "item-list",
    projectNumber,
    "--owner",
    projectOwner,
    "--limit",
    "1000",
    "--format",
    "json",
  ]);
  return response.items ?? [];
}

async function projectFields(): Promise<JsonRecord[]> {
  const response = await runJson<{ fields?: JsonRecord[] }>([
    "project",
    "field-list",
    projectNumber,
    "--owner",
    projectOwner,
    "--format",
    "json",
  ]);
  return response.fields ?? [];
}

function projectInfo(): Promise<JsonRecord> {
  return runJson<JsonRecord>([
    "project",
    "view",
    projectNumber,
    "--owner",
    projectOwner,
    "--format",
    "json",
  ]);
}

function findField(fields: JsonRecord[], name: string): JsonRecord {
  const field = fields.find((candidate) => candidate.name === name);
  return field ?? fail(`Project field not found: ${name}`);
}

function findOption(field: JsonRecord, value: string): JsonRecord {
  const options = Array.isArray(field.options)
    ? field.options.filter(
        (entry): entry is JsonRecord =>
          typeof entry === "object" && entry !== null
      )
    : [];
  const selectedOption = options.find(
    (candidate) =>
      normalizeOption(String(candidate.name)) === normalizeOption(value)
  );
  return (
    selectedOption ??
    fail(`Option not found for ${String(field.name)}: ${value}`)
  );
}

function issueNumber(item: JsonRecord): number | undefined {
  const content = item.content as JsonRecord | undefined;
  return typeof content?.number === "number" ? content.number : undefined;
}

function findItem(items: JsonRecord[], number: number): JsonRecord {
  const item = items.find((candidate) => issueNumber(candidate) === number);
  return item ?? fail(`Issue #${number} is not in project ${projectNumber}`);
}

async function setField(
  issue: number,
  fieldName: string,
  value: string
): Promise<void> {
  const [items, fields, project] = await Promise.all([
    projectItems(),
    projectFields(),
    projectInfo(),
  ]);
  const item = findItem(items, issue);
  const field = findField(fields, fieldName);
  const option = findOption(field, value);

  await runGh([
    "project",
    "item-edit",
    "--id",
    String(item.id),
    "--project-id",
    String(project.id),
    "--field-id",
    String(field.id),
    "--single-select-option-id",
    String(option.id),
  ]);
}

async function summary(): Promise<void> {
  const items = await projectItems();
  const statusCounts = new Map<string, number>();
  const sizeCounts = new Map<string, number>();
  const missingMetadata: JsonRecord[] = [];
  const drafts: JsonRecord[] = [];

  for (const item of items) {
    const status = String(item.status ?? "missing");
    const size = String(item.size ?? "missing");
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    sizeCounts.set(size, (sizeCounts.get(size) ?? 0) + 1);
    if ((item.content as JsonRecord | undefined)?.type === "DraftIssue") {
      drafts.push({ id: item.id, title: item.title });
    }
    if (!(item.priority && item.size && item.status)) {
      missingMetadata.push({
        issue: issueNumber(item),
        priority: item.priority ?? null,
        size: item.size ?? null,
        status: item.status ?? null,
        title: item.title,
      });
    }
  }

  print({
    drafts,
    itemCount: items.length,
    missingMetadata,
    project: { number: projectNumber, owner: projectOwner, repository },
    sizes: Object.fromEntries(sizeCounts),
    statuses: Object.fromEntries(statusCounts),
  });
}

async function list(): Promise<void> {
  print(await projectItems());
}

async function show(issue: number): Promise<void> {
  const items = await projectItems();
  const item = findItem(items, issue);
  const issueData = await runJson<JsonRecord>([
    "issue",
    "view",
    String(issue),
    "--repo",
    repository,
    "--json",
    "number,title,url,state,parent,blockedBy,subIssues",
  ]);
  print({ issue: issueData, projectItem: item });
}

async function reconcile(): Promise<void> {
  const [items, issues] = await Promise.all([
    projectItems(),
    runJson<JsonRecord[]>([
      "issue",
      "list",
      "--repo",
      repository,
      "--state",
      "all",
      "--limit",
      "1000",
      "--json",
      "number,title,url,parent,blockedBy",
    ]),
  ]);
  const issueNumbers = new Set(issues.map((issue) => issue.number));
  const projectNumbers = new Set(
    items
      .map(issueNumber)
      .filter((number): number is number => number !== undefined)
  );
  const missingFromProject = issues
    .filter(
      (issue) =>
        typeof issue.number === "number" && !projectNumbers.has(issue.number)
    )
    .map((issue) => ({ number: issue.number, title: issue.title }));
  const missingFromRepository = items
    .filter((item) => issueNumber(item) === undefined)
    .map((item) => ({ id: item.id, title: item.title }));
  const invalidStatuses = items
    .filter(
      (item) =>
        !STATUS_NAMES.some(
          (status) => normalizeOption(String(item.status)) === status
        )
    )
    .map((item) => ({
      issue: issueNumber(item),
      status: item.status,
      title: item.title,
    }));
  const missingMetadata = items
    .filter((item) => !(item.priority && item.size && item.status))
    .map((item) => ({
      issue: issueNumber(item),
      priority: item.priority ?? null,
      size: item.size ?? null,
      status: item.status ?? null,
      title: item.title,
    }));
  const parentlessIssues = issues
    .filter((issue) => typeof issue.number === "number" && !issue.parent)
    .map((issue) => ({ number: issue.number, title: issue.title }));

  print({
    draftItems: items.filter(
      (item) => (item.content as JsonRecord | undefined)?.type === "DraftIssue"
    ),
    invalidStatuses,
    missingFromProject,
    missingFromRepository,
    missingMetadata,
    parentlessIssues,
    projectIssueCount: projectNumbers.size,
    repositoryIssueCount: issueNumbers.size,
  });
}

async function main(): Promise<void> {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (command === "list") {
    await list();
    return;
  }
  if (command === "summary") {
    await summary();
    return;
  }
  if (command === "reconcile" || command === "verify") {
    await reconcile();
    return;
  }

  const issue = Number(options.get("issue"));
  if (!Number.isInteger(issue) || issue < 1) {
    fail("This command requires --issue <number>");
  }

  if (command === "show") {
    await show(issue);
    return;
  }
  if (command === "move") {
    const status = options.get("status");
    if (!status) {
      fail("move requires --status <todo|in-progress|review|done>");
    }
    const normalizedStatus = normalizeStatus(status);
    await setField(issue, "Status", normalizedStatus);
    print({ issue, status: normalizedStatus });
    return;
  }
  if (command === "set-metadata") {
    const priority = options.get("priority");
    const size = options.get("size");
    if (!(priority || size)) {
      fail("set-metadata requires --priority and/or --size");
    }
    if (priority) {
      await setField(issue, "Priority", priority);
    }
    if (size) {
      await setField(issue, "Size", size);
    }
    print({ issue, priority: priority ?? null, size: size ?? null });
    return;
  }

  fail(`Unknown command: ${command}`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

export {};
