import { Hono } from "hono";
import { canonicalizeGpx } from "../gpx/canonicalize.js";
import { assertValidCanonicalGpxDocument } from "../gpx/schema.js";
import { serializeGpx } from "../gpx/serialize.js";
import { GpxNormalizationError } from "../gpx/errors.js";
import { parseGpxXml } from "../gpx/parse.js";
import { assertSafeGpxXml } from "../gpx/xml-security-filter.js";
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
    const rawText = await file.text();
    assertSafeGpxXml(rawText, config.gpxPolicy.maxRawBytes);
    const document = parseGpxXml(rawText);
    const canonical = canonicalizeGpx(document, config.gpxPolicy);
    assertValidCanonicalGpxDocument(canonical);
    gpxXml = serializeGpx(canonical);
  } catch (error) {
    const message =
      error instanceof GpxNormalizationError
        ? error.message
        : "invalid GPX file";

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
