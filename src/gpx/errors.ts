export class GpxNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GpxNormalizationError";
  }
}

// A canonicalizer invariant failure is internal, not an invalid-GPX 400.
// Retrieval will classify this separately at its boundary in B4.
export class CanonicalValidationError extends Error {
  constructor(readonly reason: "structure" | "coordinates" | "text" | "time" | "resource" | "geometry") {
    super("invalid canonical GPX document");
    this.name = "CanonicalValidationError";
  }
}
