export class GpxNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GpxNormalizationError";
  }
}
