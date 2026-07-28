import { devToolsMiddleware } from "@ai-sdk/devtools";
import { google } from "@ai-sdk/google";
import { createFileRoute } from "@tanstack/react-router";
import {
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
  convertToModelMessages,
  wrapLanguageModel,
} from "ai";
import type { RequestLogger } from "evlog";
import { createAILogger, createEvlogIntegration } from "evlog/ai";
import { useRequest } from "nitro/context";

export const Route = createFileRoute("/api/ai/$")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { messages }: { messages: UIMessage[] } = await request.json();

          const ai = createAILogger(useRequest().context.log as RequestLogger);

          const model = wrapLanguageModel({
            model: google("gemini-2.5-flash"),
            middleware: devToolsMiddleware(),
          });
          const result = streamText({
            model: ai.wrap(model),
            messages: await convertToModelMessages(messages),
            telemetry: {
              isEnabled: true,
              integrations: [createEvlogIntegration(ai)],
            },
          });

          return createUIMessageStreamResponse({
            stream: toUIMessageStream({ stream: result.stream }),
          });
        } catch (error) {
          console.error("AI API error:", error);
          return new Response(JSON.stringify({ error: "Failed to process AI request" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
