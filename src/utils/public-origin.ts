import type { Context } from "hono";
import { getConfig } from "../config.js";

export function getPublicOrigin(c: Context): string {
  return new URL(c.req.url).origin;
}
