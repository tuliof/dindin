import { publishApplicationEvent } from "@/lib/log-stream";
import type { LogLevel } from "@/lib/log-types";

const EMAIL_SIGN_IN_PATH = "/api/auth/sign-in/email";

function statusForError(error: unknown): number {
  if (typeof error === "object" && error !== null && "status" in error) {
    const { status } = error;
    if (typeof status === "number" && status >= 400 && status <= 599) {
      return status;
    }
  }

  return 500;
}

function errorClassForStatus(status: number): string {
  if (status === 401) {
    return "unauthorized";
  }
  if (status === 400) {
    return "bad_request";
  }
  if (status >= 500) {
    return "server_error";
  }
  return "request_error";
}

async function hasEmailIdentifier(request: Request): Promise<boolean> {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body: unknown = await request.clone().json();
      return (
        typeof body === "object" &&
        body !== null &&
        "email" in body &&
        typeof body.email === "string" &&
        body.email.length > 0
      );
    }

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const body = await request.clone().text();
      return Boolean(new URLSearchParams(body).get("email"));
    }
  } catch {
    return false;
  }

  return false;
}

function publishAuthEvent(input: {
  level: LogLevel;
  outcome: "failed" | "succeeded";
  status: number;
  identifierSupplied: boolean;
}): void {
  publishApplicationEvent({
    level: input.level,
    message:
      input.outcome === "failed"
        ? "Authentication login failed"
        : "Authentication login succeeded",
    metadata: {
      action: "login",
      endpoint: EMAIL_SIGN_IN_PATH,
      errorClass:
        input.outcome === "failed" ? errorClassForStatus(input.status) : "none",
      identifierSupplied: input.identifierSupplied,
      outcome: input.outcome,
      status: input.status,
    },
  });
}

export async function handleAuthBoundaryRequest(
  request: Request,
  handler: (request: Request) => Promise<Response>
): Promise<Response> {
  if (new URL(request.url).pathname !== EMAIL_SIGN_IN_PATH) {
    return handler(request);
  }

  const identifierSupplied = await hasEmailIdentifier(request);

  try {
    const response = await handler(request);
    const failed = response.status >= 400;
    publishAuthEvent({
      identifierSupplied,
      level: failed ? "warn" : "info",
      outcome: failed ? "failed" : "succeeded",
      status: response.status,
    });
    return response;
  } catch (error) {
    const status = statusForError(error);
    publishAuthEvent({
      identifierSupplied,
      level: "error",
      outcome: "failed",
      status,
    });
    throw error;
  }
}
