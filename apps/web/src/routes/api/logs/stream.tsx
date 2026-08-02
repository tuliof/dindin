import { auth } from "@dindin/auth";
import { createFileRoute } from "@tanstack/react-router";

import {
  getLogStream,
  publishApplicationEvent,
  toLogEntry,
} from "@/lib/log-stream";

const encoder = new TextEncoder();

function encodeReadyEvent(): Uint8Array {
  return encoder.encode("event: ready\ndata: {}\n\n");
}

function encodeEvent(entry: ReturnType<typeof toLogEntry>): Uint8Array {
  return encoder.encode(`event: log\ndata: ${JSON.stringify(entry)}\n\n`);
}

export const Route = createFileRoute("/api/logs/stream")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
          return new Response("Unauthorized", { status: 401 });
        }

        const stream = getLogStream();
        const iterator = stream.events();
        let closed = false;
        let keepalive: ReturnType<typeof setInterval> | undefined;
        let onAbort: (() => void) | undefined;

        const body = new ReadableStream<Uint8Array>({
          cancel() {
            onAbort?.();
          },
          start(controller) {
            const close = () => {
              if (closed) {
                return;
              }
              closed = true;
              if (keepalive) {
                clearInterval(keepalive);
              }
              if (onAbort) {
                request.signal.removeEventListener("abort", onAbort);
              }
              iterator.return?.()?.catch(() => undefined);
              controller.close();
            };

            onAbort = close;
            request.signal.addEventListener("abort", close, { once: true });
            controller.enqueue(encodeReadyEvent());
            for (const event of stream.recent()) {
              controller.enqueue(encodeEvent(toLogEntry(event)));
            }
            keepalive = setInterval(() => {
              if (!closed) {
                controller.enqueue(encoder.encode(": keepalive\n\n"));
              }
            }, 15_000);

            publishApplicationEvent({
              message: "Logs stream connected",
              metadata: { endpoint: "/api/logs/stream", outcome: "connected" },
            });

            (async () => {
              try {
                for await (const event of iterator) {
                  if (closed) {
                    return;
                  }
                  controller.enqueue(encodeEvent(toLogEntry(event)));
                }
              } catch {
                close();
              }
            })().catch(() => close());
          },
        });

        return new Response(body, {
          headers: {
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "Content-Type": "text/event-stream",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
