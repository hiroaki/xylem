const encoder = new TextEncoder();

type DeleteTokenPayload = {
  id: string;
  deleteKey: string;
};

/*
  * The HMAC signature is generated from the exact JSON.stringify()
  * representation of the payload.
  *
  * Keep payload generation in a single place and avoid changing the
  * property order or serialization format unless the token format is
  * intentionally changed.
  *
  * If this token needs to be generated or verified by other services,
  * introduce a canonical JSON serialization format.
  */
export async function createDeleteToken(
  payload: DeleteTokenPayload,
  secret: string,
): Promise<string> {
  const data = JSON.stringify(payload);

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(data),
  );

  return [
    encodeBase64(data),
    encodeBase64(signature),
  ].join(".");
}

export async function verifyDeleteToken(
  token: string,
  secret: string,
): Promise<DeleteTokenPayload | null> {
  const [encodedData, encodedSignature] =
    token.split(".");

  if (!encodedData || !encodedSignature) {
    return null;
  }

  const data = new TextDecoder().decode(decodeBase64(encodedData));
  const signature = decodeBase64(encodedSignature);

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["verify"],
  );

  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    encoder.encode(data),
  );

  if (!valid) {
    return null;
  }

  return JSON.parse(data) as DeleteTokenPayload;
}

function encodeBase64(value: string | ArrayBuffer) {
  const bytes =
    typeof value === "string"
      ? encoder.encode(value)
      : new Uint8Array(value);

  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function decodeBase64(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = Uint8Array.from(
    binary,
    (char) => char.charCodeAt(0),
  );
  return bytes.buffer;
}
