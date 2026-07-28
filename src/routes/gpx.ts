import { Hono } from "hono";
import { getConfig } from "../config.js";
import { AnemochoreClient } from "../services/anemochore.js";
import { verifyDeleteToken } from "../utils/delete-token.js";

const gpx = new Hono();
const config = getConfig();

gpx.get("/api/gpx/:id", async (c) => {
  const client = new AnemochoreClient(
    config.anemochoreApiUrl,
    config.anemochoreApiKey,
  );

  const response = await client.getGpx(
    c.req.param("id"),
  );

  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
});

gpx.delete("/api/gpx/:id", async (c) => {
  const deleteToken = c.req.header("X-Delete-Token");

  if (!deleteToken) {
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
    return c.json(
      {
        error: "invalid delete token",
      },
      403,
    );
  }

  if (payload.id !== c.req.param("id")) {
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

  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
});

export default gpx;
