import { auth } from "@dindin/auth";
import {
  type BetterAuthInstance,
  createAuthIdentifier,
} from "evlog/better-auth";
import { defineNitroPlugin } from "nitro";

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook(
    "request",
    createAuthIdentifier(auth as BetterAuthInstance, {
      exclude: ["/api/auth/**"],
      maskEmail: true,
    })
  );
});
