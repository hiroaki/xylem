import type { BaseLogger } from "@hono/structured-logger";

declare module "hono" {
  interface ContextVariableMap {
    logger: BaseLogger;
    clientIp: string | undefined;
  }
}
