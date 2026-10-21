import type { Context } from "hono";
import { getConfig } from "../config.js";

class AnemochoreClient {
  constructor(
    private apiUrl: string,
    private apiKey: string,
    private extraHeaders: Record<string, string> = {},
  ) {}

  private headers() {
    return {
      ...this.extraHeaders,
    };
  }

  private authenticatedHeaders() {
    return {
      ...this.extraHeaders,
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  async upload(canonicalJson: string): Promise<Response> {
    const response = await fetch(`${this.apiUrl}/api/upload`, {
      method: "POST",
      headers: {
        ...this.authenticatedHeaders(),
        "Content-Type": "application/json",
      },
      body: canonicalJson,
    });

    return response;
  }

  async getGpx(id: string, signal?: AbortSignal): Promise<Response> {
    const response = await fetch(`${this.apiUrl}/api/gpx/${encodeURIComponent(id)}`, {
      headers: this.headers(),
      signal,
      redirect: "manual",
    });

    return response;
  }

  async deleteGpx(
    id: string,
    deleteKey: string,
  ): Promise<Response> {
    const response = await fetch(`${this.apiUrl}/api/gpx/${id}`, {
      method: "DELETE",
      headers: {
        ...this.authenticatedHeaders(),
        "X-Delete-Key": deleteKey,
      },
    });

    return response;
  }
}

const config = getConfig();

export function createAnemochoreClient(c: Context): AnemochoreClient {
  return new AnemochoreClient(
    config.anemochoreApiUrl,
    config.anemochoreApiKey,
    {
      "X-Request-Id": c.var.requestId,
      ...(c.var.clientIp
        ? { "X-Client-IP": c.var.clientIp }
        : {}),
    },
  );
}
