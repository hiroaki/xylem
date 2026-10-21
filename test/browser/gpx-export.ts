import { expect, type Page } from "@playwright/test";
import { processGpxInput } from "../../src/gpx/process.js";
import type { CanonicalGpxDocument } from "../../src/gpx/contract.js";
import { policy } from "../helpers/phase-a.js";

// An independent expected canonical object is the oracle, not the export parser.
// Xylem reparses the actual downloaded bytes; only Birch's documented time
// spelling/precision change is projected away. Arrays, absence and zeros remain.
export function exportSemantics(document: CanonicalGpxDocument): CanonicalGpxDocument {
  const copy = structuredClone(document);
  for (const track of copy.data.tracks) for (const segment of track.segments) {
    for (const point of segment.points) if (point.time !== undefined) point.time = new Date(point.time).toISOString();
  }
  for (const route of copy.data.routes) for (const point of route.points) {
    if (point.time !== undefined) point.time = new Date(point.time).toISOString();
  }
  return copy;
}

export async function downloadAndCompare(page: Page, expected: CanonicalGpxDocument) {
  await page.getByRole("button", { name: "GPX export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export GPX", exact: true }).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.gpx$/);
  const stream = await download.createReadStream();
  if (!stream) throw new Error("Downloaded GPX has no readable body");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const xml = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  expect(xml).toContain('version="1.1"');
  expect(processGpxInput(xml, policy)).toEqual(exportSemantics(expected));
  return xml;
}
