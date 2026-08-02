import { createFsDrain } from "evlog/fs";
import { definePlugin } from "nitro";

import { getLogStream } from "../../src/lib/log-stream";

const fileDrain = createFsDrain({ maxFiles: 2, pretty: false });

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook("evlog:drain", getLogStream().drain);
  nitroApp.hooks.hook("evlog:drain", fileDrain);
});
