import type { Context } from "hono";

export function getPublicOrigin(c: Context): string {
  return new URL(c.req.url).origin;
}
