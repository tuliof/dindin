import type { WideEvent } from "evlog";
import { createStreamDrain } from "evlog/stream";

import type { LogEntry, LogLevel } from "@/lib/log-types";

const MAX_BUFFER_SIZE = 250;
const SENSITIVE_KEY =
  /access[-_]?token|account|api[-_]?key|authorization|body|cookie|data|financial|input|output|password|payload|provider|request|response|routing|secret|token|transaction/i;

// Keep the publisher and SSE consumers on the same in-process bounded stream.
const stream = createStreamDrain({ buffer: MAX_BUFFER_SIZE });

function isLogLevel(value: unknown): value is LogLevel {
  return (
    value === "debug" ||
    value === "info" ||
    value === "warn" ||
    value === "error" ||
    value === "fatal"
  );
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (
    depth > 3 ||
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => sanitizeValue(item, depth + 1));
  }
  if (typeof value !== "object") {
    return String(value);
  }

  const result: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (!SENSITIVE_KEY.test(key)) {
      result[key] = sanitizeValue(nestedValue, depth + 1);
    }
  }
  return result;
}

export function toLogEntry(event: WideEvent): LogEntry {
  const { environment, timestamp, level, message, service, ...metadata } =
    event as WideEvent & {
      level?: unknown;
      message?: unknown;
      service?: unknown;
      timestamp?: unknown;
    };

  return {
    id: crypto.randomUUID(),
    level: isLogLevel(level) ? level : "info",
    message: typeof message === "string" ? message : "Web request completed",
    metadata: sanitizeValue(metadata) as Record<string, unknown>,
    service: typeof service === "string" ? service : undefined,
    timestamp:
      typeof timestamp === "string" ? timestamp : new Date().toISOString(),
  };
}

export function publishApplicationEvent(input: {
  level?: LogLevel;
  message: string;
  metadata?: Record<string, unknown>;
}): void {
  const metadata = sanitizeValue(input.metadata ?? {}) as Record<
    string,
    unknown
  >;
  const event: WideEvent = {
    ...metadata,
    environment: "web",
    level: input.level ?? "info",
    message: input.message,
    service: "dindin-web",
    timestamp: new Date().toISOString(),
  } as WideEvent;

  stream.drain({ event }).catch(() => undefined);
}

export function getLogStream() {
  return stream;
}
