import pino from "pino";

import { getConfig } from "../config.js";

const config = getConfig();

export const rootLogger = pino({
  level: config.logLevel,
  base: undefined,
});
