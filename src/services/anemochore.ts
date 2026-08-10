export class AnemochoreClient {
  constructor(
    private apiUrl: string,
    private apiKey: string,
  ) {}

  private headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  async upload(file: File): Promise<Response> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${this.apiUrl}/api/upload`, {
      method: "POST",
      headers: this.headers(),
      body: formData,
    });
    return response;
  }

  async getGpx(id: string): Promise<Response> {
    const response = await fetch(`${this.apiUrl}/api/gpx/${id}`);
    return response;
  }

  async deleteGpx(
    id: string,
    deleteKey: string,
  ): Promise<Response> {
    const response = await fetch(`${this.apiUrl}/api/gpx/${id}`, {
      method: "DELETE",
      headers: {
        ...this.headers(),
        "X-Delete-Key": deleteKey,
      },
    });
    return response;
  }
}
