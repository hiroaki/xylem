import pino from "pino";
import type { BaseLogger } from "@hono/structured-logger";

import { getConfig } from "../config.js";

function createDefaultRootLogger() {
  const config = getConfig();

  return pino({
    level: config.logLevel,
    base: undefined,
  });
}

let rootLogger: BaseLogger = createDefaultRootLogger();

export function getRootLogger(): BaseLogger {
  return rootLogger;
}

export function setRootLoggerForTesting(
  logger: BaseLogger,
) {
  rootLogger = logger;
}

export function resetRootLoggerForTesting() {
  rootLogger = createDefaultRootLogger();
}
