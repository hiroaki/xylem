export type Config = {
  anemochoreApiUrl: string;
  anemochoreApiKey: string;
  xylemPublicOrigin: string;
  viewerUrlTemplate: string;
  xylemDeleteSecret: string;
};

export function getConfig(): Config {
  return {
    anemochoreApiUrl: process.env.ANEMOCHORE_API_URL!,
    anemochoreApiKey: process.env.ANEMOCHORE_API_KEY!,
    xylemPublicOrigin: process.env.XYLEM_PUBLIC_ORIGIN!,
    viewerUrlTemplate: process.env.VIEWER_URL_TEMPLATE!,
    xylemDeleteSecret: process.env.XYLEM_DELETE_SECRET!,
  };
}
