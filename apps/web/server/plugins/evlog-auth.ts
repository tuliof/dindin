import { auth } from "@dindin/auth";
import {
  type BetterAuthInstance,
  createAuthIdentifier,
} from "evlog/better-auth";

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook(
    "request",
    createAuthIdentifier(auth as BetterAuthInstance, {
      exclude: ["/api/auth/**"],
      maskEmail: true,
    })
  );
});
