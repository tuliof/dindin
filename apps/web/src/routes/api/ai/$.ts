import { devToolsMiddleware } from "@ai-sdk/devtools";
import { google } from "@ai-sdk/google";
import { createFileRoute } from "@tanstack/react-router";
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
import { useRequest as getRequest } from "nitro/context";

export const Route = createFileRoute("/api/ai/$")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { messages }: { messages: UIMessage[] } = await request.json();

          const ai = createAILogger(getRequest().context.log as RequestLogger);

          const model = wrapLanguageModel({
            middleware: devToolsMiddleware(),
            model: google("gemini-2.5-flash"),
          });
          const result = streamText({
            messages: await convertToModelMessages(messages),
            model: ai.wrap(model),
            telemetry: {
              integrations: [createEvlogIntegration(ai)],
              isEnabled: true,
            },
          });

          return createUIMessageStreamResponse({
            stream: toUIMessageStream({ stream: result.stream }),
          });
        } catch (error) {
          console.error("AI API error:", error);
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
