import { Hono } from "hono";
import { processGpxFile } from "../gpx/process.js";
import { serializeGpx } from "../gpx/serialize.js";
import { GpxNormalizationError } from "../gpx/errors.js";
import { emitAuditEvent } from "../logging/audit-event.js";
import { getConfig } from "../config.js";

const normalize = new Hono();
const config = getConfig();

normalize.post("/api/normalize", async (c) => {
  const formData = await c.req.raw.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    emitAuditEvent(c, {
      event: "normalize_rejected",
      result: "failure",
      status: 400,
    });

    return c.json(
      { error: "file is required" },
      400,
    );
  }

  emitAuditEvent(c, {
    event: "normalize_requested",
    result: "success",
  });

  let gpxXml: string;

  try {
    const canonical = await processGpxFile(file, config.gpxPolicy);
    gpxXml = serializeGpx(canonical, config.gpxPolicy);
  } catch (error) {
    // Preserve internal-failure status while keeping arbitrary exception text
    // out of Hono's application/audit error logs (it may contain GPX data).
    if (!(error instanceof GpxNormalizationError)) throw new Error("GPX processing failed");
    const message = error.message;

    emitAuditEvent(c, {
      event: "normalize_completed",
      result: "failure",
      status: 400,
    });

    return c.json(
      { error: message },
      400,
    );
  }

  emitAuditEvent(c, {
    event: "normalize_completed",
    result: "success",
    status: 200,
  });

  return c.body(
    gpxXml,
    200,
    { "Content-Type": "application/gpx+xml; charset=utf-8" },
  );
});

export default normalize;
