export type Config = {
  anemochoreApiUrl: string;
  anemochoreApiKey: string;
  anemochorePublicOrigin: string;
  xylemDeleteSecret: string;
};

export function getConfig(): Config {
  return {
    anemochoreApiUrl: process.env.ANEMOCHORE_API_URL!,
    anemochoreApiKey: process.env.ANEMOCHORE_API_KEY!,
    anemochorePublicOrigin: process.env.ANEMOCHORE_PUBLIC_ORIGIN!,
    xylemDeleteSecret: process.env.XYLEM_DELETE_SECRET!,
  };
}
