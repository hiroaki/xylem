import { Hono } from "hono";
import { getConfig } from "../config.js";
import { AnemochoreClient } from "../services/anemochore.js";
import { createDeleteToken } from "../utils/delete-token.js";
import { buildDeleteUrl } from "../utils/delete-url.js";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { getPublicOrigin } from "../utils/public-origin.js";
import {
  emitAuditEvent,
  resultFromStatus,
} from "../logging/audit-event.js";

const upload = new Hono();
const config = getConfig();

upload.post("/api/upload", async (c) => {
  const formData = await c.req.raw.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    emitAuditEvent(c, {
      event: "upload_rejected",
      result: "failure",
      status: 400,
    });

    return c.json(
      { error: "file is required" },
      400,
    );
  }

  emitAuditEvent(c, {
    event: "upload_received",
    result: "success",
  });

  const client = new AnemochoreClient(
    config.anemochoreApiUrl,
    config.anemochoreApiKey,
  );

  const response = await client.upload(file);
  const data = await response.json();

  emitAuditEvent(c, {
    event: "anemochore_upload_requested",
    result: resultFromStatus(response.status),
    status: response.status,
  });

  if (data.url) {
    data.url = rewritePublicUrl(
      data.url,
      getPublicOrigin(c),
    );
  }

  if (!data.id || !data.delete_key) {
    emitAuditEvent(c, {
      event: "gpx_stored",
      result: "failure",
      status: response.status,
    });

    throw new Error(
      "Invalid response from Anemochore: id or delete_key is missing",
    );
  }

  emitAuditEvent(c, {
    event: "gpx_stored",
    result: resultFromStatus(response.status),
    status: response.status,
    gpx_id: data.id,
  });

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
