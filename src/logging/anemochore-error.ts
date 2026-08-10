type ErrorWithCause = {
  cause?: unknown;
  code?: unknown;
};

function readErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as ErrorWithCause).code;
    if (typeof code === "string") {
      return code;
    }
  }

  return undefined;
}

export function getSafeNetworkErrorDetails(
  error: unknown,
): {
  error_message: string;
  error_code?: string;
} {
  const baseMessage =
    error instanceof Error
      ? error.message
      : "network_error";

  const directCode = readErrorCode(error);
  const causeCode =
    typeof error === "object" &&
    error !== null &&
    "cause" in error
      ? readErrorCode((error as ErrorWithCause).cause)
      : undefined;

  const errorCode = directCode ?? causeCode;

  if (errorCode) {
    return {
      error_message: `${baseMessage} (${errorCode})`,
      error_code: errorCode,
    };
  }

  return {
    error_message: baseMessage,
  };
}

export function buildAnemochoreUnreachableError(
  operation: string,
  errorCode?: string,
): Error {
  const suffix = errorCode
    ? ` (${errorCode})`
    : "";

  return new Error(
    `Anemochore ${operation} failed${suffix}`,
  );
}
