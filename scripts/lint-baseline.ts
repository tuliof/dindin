#!/usr/bin/env bun

interface Diagnostic {
  category: string;
  location: {
    path: string;
  };
}

interface Baseline {
  diagnostics: string[][];
}

interface Report {
  diagnostics: Diagnostic[];
}

interface BunFile {
  json: () => Promise<unknown>;
}

declare const Bun: {
  file: (path: string) => BunFile;
  spawn: (
    args: string[],
    options: { stderr: "pipe"; stdout: "pipe" }
  ) => {
    exited: Promise<number>;
    stderr: ReadableStream<Uint8Array>;
    stdout: ReadableStream<Uint8Array>;
  };
};

const baseline = (await Bun.file(
  ".github/ultracite-baseline.json"
).json()) as Baseline;
const allowed = new Set(
  baseline.diagnostics.map(([path, category]) => `${path}|${category}`)
);
const child = Bun.spawn(["bun", "x", "ultracite", "check", "--reporter=json"], {
  stderr: "pipe",
  stdout: "pipe",
});
const [stdout, stderr, exitCode] = await Promise.all([
  new Response(child.stdout).text(),
  new Response(child.stderr).text(),
  child.exited,
]);

let report: Report;
try {
  report = JSON.parse(stdout) as Report;
} catch {
  console.error(stderr);
  console.error(stdout);
  process.exit(exitCode || 1);
}

const unexpected = report.diagnostics.filter(
  (diagnostic) =>
    !allowed.has(`${diagnostic.location.path}|${diagnostic.category}`)
);

if (unexpected.length > 0) {
  console.error(stderr);
  console.error(
    `Ultracite found ${unexpected.length} diagnostic(s) outside the approved baseline.`
  );
  process.exit(1);
}

console.log(
  `Ultracite passed; accepted ${report.diagnostics.length} known baseline diagnostic(s).`
);
