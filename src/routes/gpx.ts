import { Hono } from "hono";
import { getConfig } from "../config.js";
import { createAnemochoreClient } from "../services/anemochore.js";
import { verifyDeleteToken } from "../utils/delete-token.js";
import { serializeGpx } from "../gpx/serialize.js";
import {
  emitAuditEvent,
  resultFromStatus,
} from "../logging/audit-event.js";
import {
  buildAnemochoreUnreachableError,
  getSafeNetworkErrorDetails,
} from "../logging/anemochore-error.js";

const gpx = new Hono();
const config = getConfig();

gpx.get("/api/gpx/:id", async (c) => {
  const gpxId = c.req.param("id");

  emitAuditEvent(c, {
    event: "gpx_retrieval_requested",
    result: "success",
    gpx_id: gpxId,
  });

  const client = createAnemochoreClient(c);

  let response: Response;

  try {
    response = await client.getGpx(gpxId);
  } catch (error) {
    const errorDetails = getSafeNetworkErrorDetails(error);

    emitAuditEvent(c, {
      event: "anemochore_gpx_fetched",
      result: "failure",
      gpx_id: gpxId,
      failure_reason: "anemochore_unreachable",
      error_message: errorDetails.error_message,
      error_code: errorDetails.error_code,
    });

    throw buildAnemochoreUnreachableError(
      "gpx retrieval",
      errorDetails.error_code,
    );
  }

  const retrievalResult = resultFromStatus(response.status);

  emitAuditEvent(c, {
    event: "anemochore_gpx_fetched",
    result: retrievalResult,
    status: response.status,
    gpx_id: gpxId,
    ...(retrievalResult === "failure"
      ? { failure_reason: "anemochore_rejected" as const }
      : {}),
  });

  if (response.status !== 200) {
    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  }

  // Anemochore returns the canonical payload as JSON; re-serialize it to GPX XML
  // here so Tilia (which never changes) keeps receiving real GPX bytes.
  const canonicalDocument = await response.json();
  const gpxXml = serializeGpx(canonicalDocument);

  return c.body(
    gpxXml,
    200,
    { "Content-Type": "application/gpx+xml; charset=utf-8" },
  );
});

gpx.delete("/api/gpx/:id", async (c) => {
  const gpxId = c.req.param("id");

  emitAuditEvent(c, {
    event: "gpx_deletion_requested",
    result: "success",
    gpx_id: gpxId,
  });

  const deleteToken = c.req.header("X-Delete-Token");

  if (!deleteToken) {
    emitAuditEvent(c, {
      event: "gpx_deletion_rejected",
      result: "failure",
      status: 400,
      gpx_id: gpxId,
    });

    return c.json(
      {
        error: "delete token is required",
      },
      400,
    );
  }

  const payload = await verifyDeleteToken(
    deleteToken,
    config.xylemDeleteSecret,
  );

  if (!payload) {
    emitAuditEvent(c, {
      event: "gpx_deletion_rejected",
      result: "failure",
      status: 403,
      gpx_id: gpxId,
    });

    return c.json(
      {
        error: "invalid delete token",
      },
      403,
    );
  }

  if (payload.id !== gpxId) {
    emitAuditEvent(c, {
      event: "gpx_deletion_rejected",
      result: "failure",
      status: 403,
      gpx_id: gpxId,
    });

    return c.json(
      {
        error: "invalid delete token",
      },
      403,
    );
  }

  const client = createAnemochoreClient(c);

  let response: Response;

  try {
    response = await client.deleteGpx(
      payload.id,
      payload.deleteKey,
    );
  } catch (error) {
    const errorDetails = getSafeNetworkErrorDetails(error);

    emitAuditEvent(c, {
      event: "anemochore_gpx_deleted",
      result: "failure",
      gpx_id: payload.id,
      failure_reason: "anemochore_unreachable",
      error_message: errorDetails.error_message,
      error_code: errorDetails.error_code,
    });

    throw buildAnemochoreUnreachableError(
      "gpx deletion",
      errorDetails.error_code,
    );
  }

  const deletionResult = resultFromStatus(response.status);

  emitAuditEvent(c, {
    event: "anemochore_gpx_deleted",
    result: deletionResult,
    status: response.status,
    gpx_id: payload.id,
    ...(deletionResult === "failure"
      ? { failure_reason: "anemochore_rejected" as const }
      : {}),
  });

  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
});

export default gpx;
