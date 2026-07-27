export type Config = {
  anemochoreApiUrl: string;
  anemochoreApiKey: string;
};

export function getConfig(): Config {
  return {
    anemochoreApiUrl: process.env.ANEMOCHORE_API_URL!,
    anemochoreApiKey: process.env.ANEMOCHORE_API_KEY!,
  };
}
