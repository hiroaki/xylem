import { Hono } from "hono";
import { getConfig } from "../config.js";
import { AnemochoreClient } from "../services/anemochore.js";
import { buildViewerUrl } from "../utils/viewer-url.js";
import type { ContentfulStatusCode } from "hono/utils/http-status";

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
    data.url = buildViewerUrl(
      config.viewerUrlTemplate,
      rewritePublicUrl(data.url, config.xylemPublicOrigin),
    );
  }

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
