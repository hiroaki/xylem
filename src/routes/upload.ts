import { Hono } from "hono";
import { getConfig } from "../config.js";
import { AnemochoreClient } from "../services/anemochore.js";
import { createDeleteToken } from "../utils/delete-token.js";
import { buildDeleteUrl } from "../utils/delete-url.js";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { getPublicOrigin, getAnemochorePublicOrigin } from "../utils/public-origin.js";

const upload = new Hono();
const config = getConfig();

upload.post("/api/upload", async (c) => {
  const formData = await c.req.raw.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return c.json(
      { error: "file is required" },
      400,
    );
  }

  const client = new AnemochoreClient(
    config.anemochoreApiUrl,
    config.anemochoreApiKey,
  );

  const response = await client.upload(file);
  const data = await response.json();

  if (data.url) {
    data.url = rewritePublicUrl(
      data.url,
      getAnemochorePublicOrigin(),
    );
  }

  if (!data.id || !data.delete_key) {
    throw new Error(
      "Invalid response from Anemochore: id or delete_key is missing",
    );
  }

  data.deleteToken = await createDeleteToken(
    {
      id: data.id,
      deleteKey: data.delete_key,
    },
    config.xylemDeleteSecret,
  );

  data.deleteUrl = buildDeleteUrl(
    getPublicOrigin(c),
    data.id,
  );

  delete data.delete_key;

  return c.json(
    data,
    response.status as ContentfulStatusCode
  );
});

function rewritePublicUrl(url: string, origin: string) {
  const parsed = new URL(url);

  return new URL(
    parsed.pathname + parsed.search,
    origin,
  ).toString();
}

export default upload;
