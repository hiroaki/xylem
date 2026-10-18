// Expand the number's shortest round-trippable spelling without scaling or
// rounding floating-point values. Like JSON, negative zero is written as "0".
export function formatDecimal(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError("cannot format a non-finite number");
  const source = String(value);
  const [coefficient, exponent] = source.split("e");
  if (exponent === undefined) return source;
  const negative = coefficient!.startsWith("-");
  const unsigned = negative ? coefficient!.slice(1) : coefficient!;
  const dot = unsigned.indexOf(".");
  const digits = unsigned.replace(".", "");
  const position = (dot === -1 ? unsigned.length : dot) + Number(exponent);
  let decimal: string;
  if (position <= 0) decimal = "0." + "0".repeat(-position) + digits;
  else if (position >= digits.length) decimal = digits + "0".repeat(position - digits.length);
  else decimal = digits.slice(0, position) + "." + digits.slice(position);
  return (negative ? "-" : "") + decimal;
}
