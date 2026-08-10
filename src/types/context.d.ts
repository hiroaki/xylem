import type { Logger } from "pino";

declare module "hono" {
  interface ContextVariableMap {
    logger: Logger;
    clientIp: string | undefined;
  }
}
