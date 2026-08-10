import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const app = createApp();

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
