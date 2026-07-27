import { Hono } from "hono";
import { AnemochoreClient } from "../services/anemochore.js";
import { getConfig } from "../config.js";

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

  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
});

export default upload;
