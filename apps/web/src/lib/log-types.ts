export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface LogEntry {
  id: string;
  level: LogLevel;
  message: string;
  metadata: Record<string, unknown>;
  service?: string;
  timestamp: string;
}
