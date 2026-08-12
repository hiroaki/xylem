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

  async upload(file: File): Promise<Response> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${this.apiUrl}/api/upload`, {
      method: "POST",
      headers: this.authenticatedHeaders(),
      body: formData,
    });

    return response;
  }

  async getGpx(id: string): Promise<Response> {
    const response = await fetch(`${this.apiUrl}/api/gpx/${id}`, {
      headers: this.headers(),
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
