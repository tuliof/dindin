import { devToolsMiddleware } from "@ai-sdk/devtools";
import { google } from "@ai-sdk/google";
import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
  wrapLanguageModel,
} from "ai";
import type { RequestLogger } from "evlog";
import { createAILogger, createEvlogIntegration } from "evlog/ai";

import { publishApplicationEvent } from "@/lib/log-stream";

export const Route = createFileRoute("/api/ai/$")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const path = new URL(request.url).pathname;
        publishApplicationEvent({
          message: "AI request received",
          metadata: { endpoint: path, outcome: "started" },
        });
        try {
          const { messages }: { messages: UIMessage[] } = await request.json();

          const requestLog = (
            getRequest() as Request & {
              context: { log?: RequestLogger };
            }
          ).context.log;
          if (!requestLog) {
            throw new Error("Request logger is not initialized");
          }

          const ai = createAILogger(requestLog);

          const model = wrapLanguageModel({
            middleware: devToolsMiddleware(),
            model: google("gemini-2.5-flash"),
          });
          const result = streamText({
            messages: await convertToModelMessages(messages),
            model: ai.wrap(model),
            onFinish: () => {
              publishApplicationEvent({
                message: "AI request completed",
                metadata: { endpoint: path, outcome: "completed" },
              });
            },
            telemetry: {
              integrations: [createEvlogIntegration(ai)],
              isEnabled: true,
            },
          });

          return createUIMessageStreamResponse({
            stream: toUIMessageStream({ stream: result.stream }),
          });
        } catch (error) {
          publishApplicationEvent({
            level: "error",
            message: "AI request failed",
            metadata: {
              endpoint: path,
              error: error instanceof Error ? error.name : "UnknownError",
              outcome: "failed",
            },
          });
          return new Response(
            JSON.stringify({ error: "Failed to process AI request" }),
            {
              headers: { "Content-Type": "application/json" },
              status: 500,
            }
          );
        }
      },
    },
  },
});
