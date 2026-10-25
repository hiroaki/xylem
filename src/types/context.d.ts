import type { BaseLogger } from "../logging/base-logger.js";

declare module "hono" {
  interface ContextVariableMap {
    logger: BaseLogger;
    clientIp: string | undefined;
    userAgent: string | undefined;
    userAgentTruncated: boolean | undefined;
    userAgentSha256: string | undefined;
    userAgentRawLength: number | undefined;
  }
}
