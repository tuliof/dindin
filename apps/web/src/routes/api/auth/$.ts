import { auth } from "@dindin/auth";
import { createFileRoute } from "@tanstack/react-router";

import { handleAuthBoundaryRequest } from "@/lib/auth-boundary";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => auth.handler(request),
      POST: ({ request }) => handleAuthBoundaryRequest(request, auth.handler),
    },
  },
});
