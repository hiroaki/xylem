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
import {
  buildAnemochoreUnreachableError,
  getSafeNetworkErrorDetails,
} from "../logging/anemochore-error.js";

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

  let response: Response;

  try {
    response = await client.upload(file);
  } catch (error) {
    const errorDetails = getSafeNetworkErrorDetails(error);

    emitAuditEvent(c, {
      event: "anemochore_upload_requested",
      result: "failure",
      failure_reason: "anemochore_unreachable",
      error_message: errorDetails.error_message,
      error_code: errorDetails.error_code,
    });

    emitAuditEvent(c, {
      event: "gpx_stored",
      result: "failure",
      failure_reason: "anemochore_unreachable",
      error_message: errorDetails.error_message,
      error_code: errorDetails.error_code,
    });

    throw buildAnemochoreUnreachableError(
      "upload",
      errorDetails.error_code,
    );
  }

  const data = await response.json();

  const uploadResult = resultFromStatus(response.status);

  emitAuditEvent(c, {
    event: "anemochore_upload_requested",
    result: uploadResult,
    status: response.status,
    ...(uploadResult === "failure"
      ? { failure_reason: "anemochore_rejected" as const }
      : {}),
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
      ...(uploadResult === "failure"
        ? { failure_reason: "anemochore_rejected" as const }
        : {}),
    });

    throw new Error(
      "Invalid response from Anemochore: id or delete_key is missing",
    );
  }

  emitAuditEvent(c, {
    event: "gpx_stored",
    result: uploadResult,
    status: response.status,
    gpx_id: data.id,
    ...(uploadResult === "failure"
      ? { failure_reason: "anemochore_rejected" as const }
      : {}),
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
