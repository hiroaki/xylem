import { Hono } from "hono";
import { getConfig } from "../config.js";
import { AnemochoreClient } from "../services/anemochore.js";
import { verifyDeleteToken } from "../utils/delete-token.js";
import {
  emitAuditEvent,
  resultFromStatus,
} from "../logging/audit-event.js";

const gpx = new Hono();
const config = getConfig();

gpx.get("/api/gpx/:id", async (c) => {
  const gpxId = c.req.param("id");

  emitAuditEvent(c, {
    event: "gpx_retrieval_requested",
    result: "success",
    gpx_id: gpxId,
  });

  const client = new AnemochoreClient(
    config.anemochoreApiUrl,
    config.anemochoreApiKey,
  );

  const response = await client.getGpx(gpxId);

  emitAuditEvent(c, {
    event: "anemochore_gpx_fetched",
    result: resultFromStatus(response.status),
    status: response.status,
    gpx_id: gpxId,
  });

  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
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

  const client = new AnemochoreClient(
    config.anemochoreApiUrl,
    config.anemochoreApiKey,
  );

  const response = await client.deleteGpx(
    payload.id,
    payload.deleteKey,
  );

  emitAuditEvent(c, {
    event: "anemochore_gpx_deleted",
    result: resultFromStatus(response.status),
    status: response.status,
    gpx_id: payload.id,
  });

  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
});

export default gpx;
