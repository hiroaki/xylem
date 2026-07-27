import { Hono } from "hono";
import { AnemochoreClient } from "../services/anemochore.js";
import { getConfig } from "../config.js";

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
  const deleteKey = c.req.header("X-Delete-Key");

  if (!deleteKey) {
    return c.json(
      {
        error: "delete key is required",
      },
      400,
    );
  }

  const client = new AnemochoreClient(
    config.anemochoreApiUrl,
    config.anemochoreApiKey,
  );

  const response = await client.deleteGpx(
    c.req.param("id"),
    deleteKey,
  );

  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
});

export default gpx;
