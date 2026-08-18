import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { serveStatic } from "@hono/node-server/serve-static";

import upload from "./routes/upload.js";
import gpx from "./routes/gpx.js";
import health from "./routes/health.js";
import normalize from "./routes/normalize.js";
import { getConfig } from "./config.js";
import { clientIpMiddleware } from "./middlewares/client-ip.js";
import { auditLoggerMiddleware } from "./middlewares/audit-logger.js";

export function createApp(): Hono {
  const app = new Hono();
  const config = getConfig();

  app.use(
    "/*",
    requestId({
      headerName: "",
    }),
  );

  app.use("/*", clientIpMiddleware);

  app.use("/api/upload", auditLoggerMiddleware);
  app.use("/api/gpx/*", auditLoggerMiddleware);
  app.use("/api/normalize", auditLoggerMiddleware);

  app.route("/", upload);
  app.route("/", gpx);
  app.route("/", health);
  app.route("/", normalize);

  app.use(
    "/*",
    serveStatic({
      root: config.xylemStaticDir,
    }),
  );

  app.onError((_, c) => {
    return c.json(
      {
        error: "Internal Server Error",
      },
      500,
    );
  });

  return app;
}
