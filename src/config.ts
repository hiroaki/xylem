export type Config = {
  anemochoreApiUrl: string;
  anemochoreApiKey: string;
  xylemDeleteSecret: string;
  xylemStaticDir: string;
  xylemTrustProxy: boolean;
  xylemTrustedClientIpHeader: string;
  logLevel: string;
};

function parseBoolean(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

export function getConfig(): Config {
  return {
    anemochoreApiUrl: process.env.ANEMOCHORE_API_URL!,
    anemochoreApiKey: process.env.ANEMOCHORE_API_KEY!,
    xylemDeleteSecret: process.env.XYLEM_DELETE_SECRET!,
    xylemStaticDir: process.env.XYLEM_STATIC_DIR ?? "./public",
    xylemTrustProxy: parseBoolean(process.env.XYLEM_TRUST_PROXY),
    xylemTrustedClientIpHeader:
      process.env.XYLEM_TRUSTED_CLIENT_IP_HEADER ?? "X-Forwarded-For",
    logLevel: process.env.LOG_LEVEL ?? "info",
  };
}
