// Calendar validation without Date.parse, timezone conversion or precision loss.
const TIMESTAMP = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.[0-9]+)?(Z|[+-]([0-9]{2}):([0-9]{2}))$/;

export function isValidGpxTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = TIMESTAMP.exec(value);
  // JavaScript $ also matches before a final newline; canonical times may not.
  if (!match || match[0].length !== value.length) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const hour = Number(match[4]), minute = Number(match[5]), second = Number(match[6]);
  if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > days[month - 1]!) return false;
  if (match[7] !== "Z") {
    const offsetHour = Number(match[8]), offsetMinute = Number(match[9]);
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return false;
  }
  return true;
}

export function normalizeGpxTime(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  return isValidGpxTime(trimmed) ? trimmed : undefined;
}
