export type LogLevel =
  | "trace"
  | "debug"
  | "info"
  | "warn"
  | "error"
  | "fatal"
  | "silent";

export type Config = {
  anemochoreApiUrl: string;
  anemochoreApiKey: string;
  xylemPublicOrigin: string;
  xylemDeleteSecret: string;
  xylemStaticDir: string;
  xylemTrustProxy: boolean;
  xylemTrustedClientIpHeader: string;
  logLevel: LogLevel;
};

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Required environment variable is not set: ${name}`);
  }

  return value;
}

function requiredUrlEnv(name: string): string {
  const value = requiredEnv(name);

  try {
    new URL(value);
  } catch {
    throw new Error(`Environment variable must be a valid URL: ${name}`);
  }

  return value;
}

function parseBoolean(value: string): boolean {
  if (value === "1" || value === "true") {
    return true;
  }

  if (value === "0" || value === "false") {
    return false;
  }

  throw new Error(`Invalid boolean value: ${value}`);
}

function parseLogLevel(value: string): LogLevel {
  switch (value) {
    case "trace":
    case "debug":
    case "info":
    case "warn":
    case "error":
    case "fatal":
    case "silent":
      return value;
    default:
      throw new Error(`Invalid LOG_LEVEL: ${value}`);
  }
}

export function getConfig(): Config {
  return {
    anemochoreApiUrl: requiredUrlEnv("ANEMOCHORE_API_URL"),
    anemochoreApiKey: requiredEnv("ANEMOCHORE_API_KEY"),
    xylemPublicOrigin: requiredUrlEnv("XYLEM_PUBLIC_ORIGIN"),
    xylemDeleteSecret: requiredEnv("XYLEM_DELETE_SECRET"),
    xylemStaticDir: process.env.XYLEM_STATIC_DIR ?? "./public",
    xylemTrustProxy: parseBoolean(process.env.XYLEM_TRUST_PROXY ?? "false"),
    xylemTrustedClientIpHeader: process.env.XYLEM_TRUSTED_CLIENT_IP_HEADER ?? "X-Forwarded-For",
    logLevel: parseLogLevel(process.env.LOG_LEVEL ?? "info"),
  };
}
