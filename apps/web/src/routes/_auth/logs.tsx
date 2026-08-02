import { Badge } from "@dindin/ui/components/badge";
import { Button } from "@dindin/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dindin/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import {
  PauseIcon,
  PlayIcon,
  Trash2Icon,
  WifiIcon,
  WifiOffIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { FinanceShell } from "@/components/finance-shell";
import type { LogEntry } from "@/lib/log-types";

export const Route = createFileRoute("/_auth/logs")({ component: LogsPage });

function LogsPage() {
  const { session } = Route.useRouteContext();
  return (
    <FinanceShell user={{ email: session.user.email, name: session.user.name }}>
      {() => <LogsPanel />}
    </FinanceShell>
  );
}

function LogsPanel() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const pausedRef = useRef(false);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const source = new EventSource("/api/logs/stream");
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.addEventListener("ready", () => setConnected(true));
    source.addEventListener("log", (event) => {
      if (pausedRef.current) {
        return;
      }
      const entry = JSON.parse(
        (event as MessageEvent<string>).data
      ) as LogEntry;
      setEntries((current) => [...current, entry].slice(-250));
    });
    return () => source.close();
  }, []);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (autoScroll && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
      outputRef.current.dataset.entryCount = String(entries.length);
    }
  }, [autoScroll, entries]);

  const clearEntries = useCallback(() => setEntries([]), []);
  const togglePaused = useCallback(() => setPaused((value) => !value), []);
  const toggleAutoScroll = useCallback(
    () => setAutoScroll((value) => !value),
    []
  );

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-4 p-4 pt-0 lg:gap-6 lg:p-6 lg:pt-0">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b py-5">
        <div>
          <p className="text-muted-foreground text-sm">Debug / web process</p>
          <h1 className="font-semibold text-2xl tracking-tight">Logs</h1>
        </div>
        <div aria-live="polite" className="flex items-center gap-2">
          {connected ? (
            <WifiIcon className="size-4 text-emerald-600" />
          ) : (
            <WifiOffIcon className="size-4 text-muted-foreground" />
          )}
          <span className="text-muted-foreground text-sm">
            {connected ? "Live" : "Disconnected"}
          </span>
        </div>
      </div>
      <Card className="min-h-0 flex-1">
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Application stream</CardTitle>
              <CardDescription>
                Recent web application events from this process. Worker and
                Docker logs are not included.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={connected ? "default" : "outline"}>
                {entries.length} buffered
              </Badge>
              <Button onClick={clearEntries} size="sm" variant="outline">
                <Trash2Icon /> Clear
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={togglePaused} size="sm" variant="outline">
              {paused ? <PlayIcon /> : <PauseIcon />}
              {paused ? "Resume" : "Pause"}
            </Button>
            <Button
              aria-pressed={autoScroll}
              onClick={toggleAutoScroll}
              size="sm"
              variant="outline"
            >
              Auto-scroll {autoScroll ? "on" : "off"}
            </Button>
          </div>
          <div
            aria-label="Live application logs"
            aria-live="polite"
            className="min-h-64 flex-1 overflow-auto bg-muted/40 p-3 font-mono text-xs"
            ref={outputRef}
            role="log"
          >
            {entries.length === 0 ? (
              <p className="py-10 text-center text-muted-foreground">
                {connected
                  ? "Waiting for web application events..."
                  : "Connect to the stream to view logs."}
              </p>
            ) : (
              entries.map((entry) => <LogLine entry={entry} key={entry.id} />)
            )}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function LogLine({ entry }: { entry: LogEntry }) {
  const metadata =
    Object.keys(entry.metadata).length > 0
      ? ` ${JSON.stringify(entry.metadata)}`
      : "";
  let levelClassName = "text-emerald-600";
  if (entry.level === "error" || entry.level === "fatal") {
    levelClassName = "text-red-600";
  } else if (entry.level === "warn") {
    levelClassName = "text-amber-600";
  }

  return (
    <div className="break-words py-0.5">
      <span className="text-muted-foreground">
        {new Date(entry.timestamp).toLocaleTimeString()}
      </span>{" "}
      <span className={levelClassName}>[{entry.level.toUpperCase()}]</span>{" "}
      <span className="text-muted-foreground">[{entry.service ?? "web"}]</span>{" "}
      <span>{entry.message}</span>
      <span className="text-muted-foreground">{metadata}</span>
    </div>
  );
}
