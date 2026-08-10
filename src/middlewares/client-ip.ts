import { getConnInfo } from "@hono/node-server/conninfo";
import { isIP } from "node:net";

import type { MiddlewareHandler } from "hono";

import { getConfig } from "../config.js";

const config = getConfig();

function getIpFromForwardedHeader(
  headerValue: string,
): string | undefined {
  const [firstHop] = headerValue
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (!firstHop || isIP(firstHop) === 0) {
    return undefined;
  }

  return firstHop;
}

export const clientIpMiddleware: MiddlewareHandler = async (
  c,
  next,
) => {
  let clientIp: string | undefined;

  if (config.xylemTrustProxy) {
    const forwardedValue = c.req.header(
      config.xylemTrustedClientIpHeader,
    );

    if (forwardedValue) {
      clientIp = getIpFromForwardedHeader(forwardedValue);
    }
  }

  if (!clientIp) {
    const connInfo = getConnInfo(c);
    if (connInfo.remote.address && isIP(connInfo.remote.address) !== 0) {
      clientIp = connInfo.remote.address;
    }
  }

  c.set("clientIp", clientIp);
  await next();
};
