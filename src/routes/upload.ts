import { Hono } from "hono";
import { AnemochoreClient } from "../services/anemochore.js";
import { getConfig } from "../config.js";
import type { ContentfulStatusCode } from "hono/utils/http-status";

const upload = new Hono();
const config = getConfig();

upload.post("/api/upload", async (c) => {
  const formData = await c.req.raw.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return c.json(
      {
        error: "file is required",
      },
      400,
    );
  }

  const client = new AnemochoreClient(
    config.anemochoreApiUrl,
    config.anemochoreApiKey,
  );

  const response = await client.upload(file);
  const data = await response.json();
  return c.json(data, response.status as ContentfulStatusCode);
});

export default upload;
