#!/usr/bin/env bun

type JsonRecord = Record<string, unknown>;
interface TaskRow {
  agent: string | null;
  blockedBy: number[];
  issue: number;
  labels: unknown;
  parent: number | null;
  priority: string | null;
  size: string | null;
  status: string;
  subIssueCount: number;
  title: string;
  url: string;
}

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
const STATUS_NAMES = [
  "todo",
  "in-progress",
  "review",
  "done",
  "blocked",
] as const;
const STATUS_USAGE = STATUS_NAMES.join("|");

type StatusName = (typeof STATUS_NAMES)[number];

const projectNumber = process.env.GITHUB_PROJECT ?? DEFAULT_PROJECT;
const projectOwner = process.env.GITHUB_PROJECT_OWNER ?? DEFAULT_OWNER;
const repository = process.env.GITHUB_REPOSITORY ?? DEFAULT_REPOSITORY;
const OWNER_PATTERN = /^## Owner\n([^\n]+)/m;
const ISSUE_URL_PATTERN = /\/issues\/(\d+)$/;
const PULL_REQUEST_URL_PATTERN = /\/pull\/(\d+)(?:[/?#].*)?$/;
const NUMBER_PATTERN = /^\d+$/;
const FAILED_CHECK_CONCLUSIONS = [
  "FAILURE",
  "ERROR",
  "CANCELLED",
  "TIMED_OUT",
  "ACTION_REQUIRED",
  "STARTUP_FAILURE",
];

export interface CheckReport {
  conclusion: string | null;
  detailsUrl: string | null;
  name: string;
  status: string | null;
}

export interface CheckAggregate {
  failed: CheckReport[];
  pending: CheckReport[];
  state: "pass" | "pending" | "failure";
}

export function rejectMergeMethodOption(
  options: Map<string, string>,
  command: "merge" | "auto-merge"
): void {
  if (options.has("method")) {
    fail(`${command} does not accept --method; squash is always used`);
  }
}

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

export function parsePullRequestReference(value: string): string {
  if (NUMBER_PATTERN.test(value)) {
    return value;
  }
  const match = value.match(PULL_REQUEST_URL_PATTERN);
  return match?.[1] ?? fail(`Invalid pull request reference: ${value}`);
}

export function parseIssueNumber(value: string): number {
  if (!NUMBER_PATTERN.test(value)) {
    fail("--issue must contain only decimal digits");
  }
  const issue = Number(value);
  if (!Number.isSafeInteger(issue) || issue < 1) {
    fail("--issue must be a positive decimal issue number");
  }
  return issue;
}

function jsonRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is JsonRecord =>
          typeof entry === "object" && entry !== null
      )
    : [];
}

function checkDetailsUrl(check: JsonRecord): string | null {
  if (typeof check.detailsUrl === "string") {
    return check.detailsUrl;
  }
  if (typeof check.targetUrl === "string") {
    return check.targetUrl;
  }
  return null;
}

function checkName(check: JsonRecord): string {
  return String(check.name ?? check.context ?? "unnamed check");
}

export function aggregateChecks(value: unknown): CheckAggregate {
  const checks = jsonRecords(value).map((check) => ({
    conclusion: typeof check.conclusion === "string" ? check.conclusion : null,
    detailsUrl: checkDetailsUrl(check),
    name: checkName(check),
    status: typeof check.status === "string" ? check.status : null,
  }));
  const failed = checks.filter((check) =>
    FAILED_CHECK_CONCLUSIONS.includes(String(check.conclusion).toUpperCase())
  );
  const pending = checks.filter(
    (check) => check.status?.toUpperCase() !== "COMPLETED" && !check.conclusion
  );
  let state: CheckAggregate["state"] = "pass";
  if (pending.length > 0) {
    state = "pending";
  }
  if (failed.length > 0) {
    state = "failure";
  }
  return { failed, pending, state };
}

export function mergePreconditionFailures(
  data: JsonRecord,
  issue: number,
  taskStatus: string
): string[] {
  const failures: string[] = [];
  const checks = aggregateChecks(data.statusCheckRollup);
  const referencesIssue = jsonRecords(data.closingIssuesReferences).some(
    (reference) => reference.number === issue
  );
  if (data.state !== "OPEN") {
    failures.push("PR is not open");
  }
  if (data.isDraft === true) {
    failures.push("PR is a draft");
  }
  if (jsonRecords(data.commits).length === 0) {
    failures.push("PR has no commits");
  }
  if (checks.pending.length > 0) {
    failures.push("PR has pending checks");
  }
  if (checks.failed.length > 0) {
    failures.push("PR has failed checks");
  }
  if (data.mergeable !== "MERGEABLE") {
    failures.push(
      `PR is not mergeable: ${String(data.mergeable ?? "unknown")}`
    );
  }
  if (data.mergeStateStatus !== "CLEAN") {
    failures.push(
      `PR merge state is not clean: ${String(data.mergeStateStatus ?? "unknown")}`
    );
  }
  if (taskStatus !== "review") {
    failures.push(`Linked project task is not in review: ${taskStatus}`);
  }
  if (!referencesIssue) {
    failures.push(`PR does not reference issue #${issue}`);
  }
  return failures;
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

function requiredOption(options: Map<string, string>, name: string): string {
  const value = options.get(name);
  return value ?? fail(`Missing required option --${name}`);
}

function validateBlockedComment(body: string): void {
  const requiredSections = ["Question", "Options", "Recommendation"];
  const missingSections = requiredSections.filter(
    (section) => !new RegExp(`^## ${section}[ \\t]*$`, "im").test(body)
  );
  if (missingSections.length > 0) {
    fail(
      `Moving to blocked requires a comment with ## Question, ## Options, and ## Recommendation sections; missing: ${missingSections.join(", ")}`
    );
  }
}

function repositoryIssues(): Promise<JsonRecord[]> {
  return runJson<JsonRecord[]>([
    "issue",
    "list",
    "--repo",
    repository,
    "--state",
    "all",
    "--limit",
    "1000",
    "--json",
    "number,title,url,parent,blockedBy,subIssues",
  ]);
}

function agentOwner(item: JsonRecord): string | undefined {
  const body = String((item.content as JsonRecord | undefined)?.body ?? "");
  return body.match(OWNER_PATTERN)?.[1];
}

function blockedByNumbers(issue: JsonRecord): number[] {
  const blockedBy = issue.blockedBy as JsonRecord | undefined;
  const nodes = Array.isArray(blockedBy?.nodes)
    ? blockedBy.nodes.filter(
        (node): node is JsonRecord => typeof node === "object" && node !== null
      )
    : [];
  return nodes
    .map((node) => node.number)
    .filter((number): number is number => typeof number === "number");
}

async function taskRows(): Promise<TaskRow[]> {
  const [items, issues] = await Promise.all([
    projectItems(),
    repositoryIssues(),
  ]);
  const issuesByNumber = new Map(
    issues
      .filter((issue) => typeof issue.number === "number")
      .map((issue) => [issue.number as number, issue])
  );

  return items.flatMap((item) => {
    const number = issueNumber(item);
    const issue = number === undefined ? undefined : issuesByNumber.get(number);
    if (number === undefined || !issue) {
      return [];
    }
    return [
      {
        agent: agentOwner(item) ?? null,
        blockedBy: blockedByNumbers(issue),
        issue: number,
        labels: item.labels ?? [],
        parent:
          Number((issue.parent as JsonRecord | undefined)?.number) || null,
        priority: item.priority ? String(item.priority) : null,
        size: item.size ? String(item.size) : null,
        status: normalizeOption(String(item.status ?? "missing")),
        subIssueCount: Number(
          (issue.subIssues as JsonRecord | undefined)?.totalCount ?? 0
        ),
        title: String(item.title),
        url: String(issue.url),
      },
    ];
  });
}

function taskSort(left: TaskRow, right: TaskRow): number {
  const priorityOrder = ["P0", "P1", "P2"];
  const sizeOrder = ["XS", "S", "M", "L", "XL"];
  const priorityDifference =
    priorityOrder.indexOf(String(left.priority)) -
    priorityOrder.indexOf(String(right.priority));
  if (priorityDifference !== 0) {
    return priorityDifference;
  }
  const sizeDifference =
    sizeOrder.indexOf(String(left.size)) -
    sizeOrder.indexOf(String(right.size));
  if (sizeDifference !== 0) {
    return sizeDifference;
  }
  return Number(left.issue) - Number(right.issue);
}

async function ready(agent?: string): Promise<void> {
  const rows = await taskRows();
  const tasks = rows
    .filter(
      (row) =>
        row.status === "todo" &&
        row.blockedBy.length === 0 &&
        row.subIssueCount === 0 &&
        (!agent || row.agent === agent)
    )
    .sort(taskSort);
  print(tasks);
}

async function blocked(agent?: string): Promise<void> {
  const rows = await taskRows();
  const tasks = rows
    .filter(
      (row) => row.status === "blocked" && (!agent || row.agent === agent)
    )
    .sort(taskSort);
  print(tasks);
}

async function dependencyBlocked(agent?: string): Promise<void> {
  const rows = await taskRows();
  const tasks = rows
    .filter(
      (row) => row.blockedBy.length > 0 && (!agent || row.agent === agent)
    )
    .sort(taskSort);
  print(tasks);
}

async function create(options: Map<string, string>): Promise<void> {
  const title = requiredOption(options, "title");
  const body = requiredOption(options, "body");
  const project = await projectInfo();
  const labels = options.get("labels")?.split(",").filter(Boolean) ?? [];
  const args = [
    "issue",
    "create",
    "--repo",
    repository,
    "--title",
    title,
    "--body",
    body,
    "--project",
    String(project.title),
  ];

  for (const label of labels) {
    args.push("--label", label);
  }
  const parent = options.get("parent");
  if (parent) {
    args.push("--parent", parent);
  }

  const url = await runGh(args);
  const issueMatch = url.match(ISSUE_URL_PATTERN);
  const issue = issueMatch ? Number(issueMatch[1]) : undefined;
  if (!issue) {
    fail(`Could not determine issue number from: ${url}`);
  }

  const priority = options.get("priority");
  const size = options.get("size");
  if (priority) {
    await setField(issue, "Priority", priority);
  }
  if (size) {
    await setField(issue, "Size", size);
  }
  print({
    issue,
    labels,
    priority: priority ?? null,
    size: size ?? null,
    title,
    url,
  });
}

async function comment(
  issue: number,
  options: Map<string, string>
): Promise<void> {
  const body = requiredOption(options, "body");
  const url = await runGh([
    "issue",
    "comment",
    String(issue),
    "--repo",
    repository,
    "--body",
    body,
  ]);
  print({ issue, url });
}

async function deliveryReport(pullRequest: string): Promise<JsonRecord> {
  const data = await runJson<JsonRecord>([
    "pr",
    "view",
    pullRequest,
    "--repo",
    repository,
    "--json",
    "number,url,state,isDraft,mergedAt,commits,statusCheckRollup,closingIssuesReferences",
  ]);
  const commits = Array.isArray(data.commits) ? data.commits : [];
  const checkAggregate = aggregateChecks(data.statusCheckRollup);
  const failedChecks = checkAggregate.failed;
  const hasCommits = commits.length > 0;
  const readyForReview = data.state === "OPEN" && data.isDraft === false;
  const merged = Boolean(data.mergedAt);
  return {
    commitCount: commits.length,
    failedChecks: failedChecks.map((check) => check.name),
    hasCommits,
    merged,
    pullRequest: data.url,
    readyForReview,
    state: data.state,
    validForDone: hasCommits && merged && failedChecks.length === 0,
    validForReview: hasCommits && readyForReview && failedChecks.length === 0,
  };
}

function pullRequestData(pullRequest: string): Promise<JsonRecord> {
  return runJson<JsonRecord>([
    "pr",
    "view",
    parsePullRequestReference(pullRequest),
    "--repo",
    repository,
    "--json",
    "number,url,state,isDraft,mergeable,mergeStateStatus,headRefOid,baseRefOid,reviewDecision,commits,statusCheckRollup,mergedAt,closingIssuesReferences",
  ]);
}

export function prStatusReport(data: JsonRecord): JsonRecord {
  const checks = aggregateChecks(data.statusCheckRollup);
  const commits = jsonRecords(data.commits);
  const readyForReview = data.state === "OPEN" && data.isDraft === false;
  return {
    baseSha: data.baseRefOid ?? null,
    commitCount: commits.length,
    failedChecks: checks.failed.map((check) => check.name),
    headSha: data.headRefOid ?? null,
    isDraft: data.isDraft ?? null,
    mergeability: data.mergeable ?? null,
    mergeState: data.mergeStateStatus ?? null,
    number: data.number ?? null,
    pendingChecks: checks.pending.map((check) => check.name),
    reviewDecision: data.reviewDecision ?? null,
    state: data.state ?? null,
    url: data.url ?? null,
    validForDone:
      commits.length > 0 &&
      data.state === "MERGED" &&
      checks.failed.length === 0,
    validForReview:
      commits.length > 0 && readyForReview && checks.failed.length === 0,
  };
}

async function prStatus(options: Map<string, string>): Promise<void> {
  const pullRequest = requiredOption(options, "pr");
  const data = await pullRequestData(pullRequest);
  print(prStatusReport(data));
}

async function prChecks(options: Map<string, string>): Promise<void> {
  const pullRequest = requiredOption(options, "pr");
  const data = await pullRequestData(pullRequest);
  const checks = aggregateChecks(data.statusCheckRollup);
  print({
    checks: jsonRecords(data.statusCheckRollup).map((check) => ({
      conclusion:
        typeof check.conclusion === "string" ? check.conclusion : null,
      detailsUrl: checkDetailsUrl(check),
      name: checkName(check),
      status: typeof check.status === "string" ? check.status : null,
    })),
    failureChecks: checks.failed.map((check) => check.name),
    pendingChecks: checks.pending.map((check) => check.name),
    state: checks.state,
    url: data.url ?? null,
  });
}

async function createPullRequest(options: Map<string, string>): Promise<void> {
  const title = requiredOption(options, "title");
  const body = requiredOption(options, "body");
  const base = options.get("base") ?? "main";
  const args = [
    "pr",
    "create",
    "--repo",
    repository,
    "--base",
    base,
    "--title",
    title,
    "--body",
    body,
  ];
  const head = options.get("head");
  if (head) {
    args.push("--head", head);
  }
  const url = await runGh(args);
  print({ base, title, url });
}

function autoMergePreconditionFailures(data: JsonRecord): string[] {
  const failures: string[] = [];
  const checks = aggregateChecks(data.statusCheckRollup);
  if (data.state !== "OPEN") {
    failures.push("PR is not open");
  }
  if (data.isDraft === true) {
    failures.push("PR is a draft");
  }
  if (jsonRecords(data.commits).length === 0) {
    failures.push("PR has no commits");
  }
  if (checks.failed.length > 0) {
    failures.push("PR has failed checks");
  }
  if (data.mergeable !== "MERGEABLE") {
    failures.push(
      `PR is not mergeable: ${String(data.mergeable ?? "unknown")}`
    );
  }
  if (data.mergeStateStatus !== "CLEAN") {
    failures.push(
      `PR merge state is not clean: ${String(data.mergeStateStatus ?? "unknown")}`
    );
  }
  return failures;
}

async function enableAutoMerge(options: Map<string, string>): Promise<void> {
  const pullRequest = requiredOption(options, "pr");
  rejectMergeMethodOption(options, "auto-merge");
  if (options.get("review-verdict") !== "approve") {
    fail(
      "Auto-merge requires the explicit local Hunk verdict --review-verdict approve"
    );
  }

  const data = await pullRequestData(pullRequest);
  const failures = autoMergePreconditionFailures(data);
  if (failures.length > 0) {
    fail(`Auto-merge preconditions failed: ${failures.join("; ")}`);
  }

  const result = await runGh([
    "pr",
    "merge",
    parsePullRequestReference(pullRequest),
    "--repo",
    repository,
    "--auto",
    "--squash",
  ]);
  print({ method: "squash", pullRequest, result });
}

async function mergePullRequest(options: Map<string, string>): Promise<void> {
  const issue = parseIssueNumber(requiredOption(options, "issue"));
  const pullRequest = requiredOption(options, "pr");
  rejectMergeMethodOption(options, "merge");
  if (options.get("review-verdict") !== "approve") {
    fail(
      "Merge requires the explicit local Hunk verdict --review-verdict approve"
    );
  }

  const [data, items] = await Promise.all([
    pullRequestData(pullRequest),
    projectItems(),
  ]);
  const item = findItem(items, issue);
  const taskStatus = normalizeOption(String(item.status ?? "missing"));
  const failures = mergePreconditionFailures(data, issue, taskStatus);
  if (failures.length > 0) {
    fail(`Merge preconditions failed: ${failures.join("; ")}`);
  }

  const mergeOutput = await runGh([
    "pr",
    "merge",
    parsePullRequestReference(pullRequest),
    "--repo",
    repository,
    "--squash",
  ]);
  print({
    issue,
    mergeMethod: "squash",
    mergeResult: mergeOutput,
    postMerge: await deliveryReport(pullRequest),
  });
}

async function validateDelivery(
  issue: number,
  options: Map<string, string>
): Promise<void> {
  const pullRequest = requiredOption(options, "pr");
  print({
    issue,
    ...(await deliveryReport(pullRequest)),
  });
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
    repositoryIssues(),
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

async function runSimpleCommand(
  command: string,
  options: Map<string, string>
): Promise<boolean> {
  if (command === "pr-status") {
    await prStatus(options);
    return true;
  }
  if (command === "pr-checks") {
    await prChecks(options);
    return true;
  }
  if (command === "pr-create") {
    await createPullRequest(options);
    return true;
  }
  if (command === "auto-merge") {
    await enableAutoMerge(options);
    return true;
  }
  if (command === "merge") {
    await mergePullRequest(options);
    return true;
  }
  if (command === "list") {
    await list();
    return true;
  }
  if (command === "summary") {
    await summary();
    return true;
  }
  if (command === "reconcile" || command === "verify") {
    await reconcile();
    return true;
  }
  if (command === "ready") {
    await ready(options.get("agent"));
    return true;
  }
  if (command === "blocked") {
    await blocked(options.get("agent"));
    return true;
  }
  if (command === "dependency-blocked") {
    await dependencyBlocked(options.get("agent"));
    return true;
  }
  if (command === "create") {
    await create(options);
    return true;
  }
  return false;
}

async function moveIssue(
  issue: number,
  options: Map<string, string>
): Promise<void> {
  const status = options.get("status");
  if (!status) {
    fail(`move requires --status <${STATUS_USAGE}>`);
  }
  const normalizedStatus = normalizeStatus(status);
  const commentBody = options.get("body");
  if (normalizedStatus === "blocked") {
    validateBlockedComment(
      commentBody ??
        fail(
          "Moving to blocked requires --body with Question, Options, and Recommendation sections"
        )
    );
  }
  const pullRequest = options.get("pr");
  if (
    (normalizedStatus === "review" || normalizedStatus === "done") &&
    !pullRequest
  ) {
    fail(`Moving to ${normalizedStatus} requires --pr <number-or-url>`);
  }
  if (normalizedStatus === "done" && options.get("qa-pass") !== "true") {
    fail("Moving to done requires --qa-pass true");
  }
  if (pullRequest) {
    const delivery = await deliveryReport(pullRequest);
    if (normalizedStatus === "review" && delivery.validForReview !== true) {
      fail("PR is not ready for review; run validate-delivery for details");
    }
    if (normalizedStatus === "done" && delivery.validForDone !== true) {
      fail(
        "PR is not merged or has failing checks; run validate-delivery for details"
      );
    }
  }
  if (normalizedStatus === "blocked") {
    await comment(issue, options);
  }
  await setField(issue, "Status", normalizedStatus);
  print({ issue, status: normalizedStatus });
}

async function runIssueCommand(
  command: string,
  issue: number,
  options: Map<string, string>
): Promise<boolean> {
  if (command === "show") {
    await show(issue);
    return true;
  }
  if (command === "comment") {
    await comment(issue, options);
    return true;
  }
  if (command === "validate-delivery") {
    await validateDelivery(issue, options);
    return true;
  }
  if (command === "move") {
    await moveIssue(issue, options);
    return true;
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
    return true;
  }
  return false;
}

async function main(): Promise<void> {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (await runSimpleCommand(command, options)) {
    return;
  }

  const rawIssue = options.get("issue");
  if (!rawIssue) {
    fail("This command requires --issue <number>");
  }
  const issue = parseIssueNumber(rawIssue);
  if (await runIssueCommand(command, issue, options)) {
    return;
  }

  fail(`Unknown command: ${command}`);
}

if (process.argv[1]?.endsWith("scripts/github-project.ts")) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
