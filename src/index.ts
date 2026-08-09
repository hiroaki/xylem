import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";

import upload from "./routes/upload.js";
import gpx from "./routes/gpx.js";
import health from "./routes/health.js";
import { getConfig } from "./config.js";

const app = new Hono();
const config = getConfig();

app.route("/", upload);
app.route("/", gpx);
app.route("/", health);

app.use(
  "/*",
  serveStatic({
    root: config.xylemStaticDir,
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

const binding = process.env.BINDING || '0.0.0.0';
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

serve(
  {
    fetch: app.fetch,
    port: port,
    hostname: binding
  },
  (info) => {
    console.info(`Xylem server starting on ${info.address}:${info.port}`);
  }
);
