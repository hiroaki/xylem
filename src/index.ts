import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";

import upload from "./routes/upload.js";
import gpx from "./routes/gpx.js";
import health from "./routes/health.js";

const app = new Hono();

app.route("/", upload);
app.route("/", gpx);
app.route("/", health);


app.use(
  "/*",
  serveStatic({
    root: "./public",
  }),
);

app.onError((err, c) => {
  console.error("Xylem internal error", {
    error: err.message,
    stack: err.stack,
    method: c.req.method,
    path: c.req.path,
  });

  return c.json(
    {
      error: "Internal Server Error",
    },
    500,
  );
});

serve({
  fetch: app.fetch,
  port: 3000,
});
