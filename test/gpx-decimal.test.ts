import { describe, expect, it, vi } from "vitest";
import { formatDecimal } from "../src/gpx/decimal.js";

const cases = [
  0, -0, 1e-7, -1e-7, 1e-6, -1e-6, 1.2345678901234567e-7,
  Number.MIN_VALUE, -Number.MIN_VALUE, 1e-323, -1e-323,
  2.2250738585072014e-308, -2.2250738585072014e-308,
  -180, 179.99999999999997, -90, 90, -99999, 99999,
  0.1 + 0.2, 1.0000000000000002, 1e21, -1e21, 1.2345678901234568e30,
  Number.MAX_VALUE, -Number.MAX_VALUE,
];
function verify(value: number) {
  const result = formatDecimal(value);
  expect(result).toMatch(/^-?[0-9]+(?:\.[0-9]+)?$/);
  expect(result).not.toMatch(/[eE]/);
  expect(Number(result)).toBe(value === 0 ? 0 : value);
}

describe("ordinary decimal without additional rounding", () => {
  it.each(cases.map((value, index) => ({value, index})))("round-trips finite case $index", ({value}) => verify(value));
  it("uses the existing JSON-compatible zero spelling and exact tiny decimal", () => {
    expect(formatDecimal(-0)).toBe("0");
    expect(formatDecimal(0)).toBe("0");
    expect(formatDecimal(1e-7)).toBe("0.0000001");
    expect(formatDecimal(-1e-7)).toBe("-0.0000001");
    expect(formatDecimal(Number.MIN_VALUE)).toBe("0." + "0".repeat(323) + "5");
  });
  it("round-trips a deterministic spread of finite IEEE-754 bit patterns", () => {
    const view = new DataView(new ArrayBuffer(8));
    let seed = 0x123456789abcdef0n;
    for (let i = 0; i < 2048; i++) {
      seed = BigInt.asUintN(64, seed * 6364136223846793005n + 1442695040888963407n);
      view.setBigUint64(0, seed);
      const value = view.getFloat64(0);
      if (Number.isFinite(value)) verify(value);
    }
  });
  it("round-trips values across every finite decimal exponent", () => {
    for (let exponent = -324; exponent <= 308; exponent++) {
      for (const sign of ["", "-"]) {
        const value = Number(`${sign}1.2345678901234567e${exponent}`);
        if (Number.isFinite(value)) verify(value);
      }
    }
  });
  it.each([NaN, Infinity, -Infinity, "1", null, undefined, {}, true])("rejects non-finite/non-number argument %# without coercion", value => {
    expect(() => formatDecimal(value as number)).toThrow(RangeError);
  });
  it("does not use locale or fixed-precision formatting", () => {
    const spies = ["toLocaleString", "toFixed", "toPrecision"].map(name => vi.spyOn(Number.prototype, name as "toFixed").mockImplementation(() => {throw new Error("unexpected formatter");}));
    try { for (const value of cases) verify(value); }
    finally { for (const spy of spies) spy.mockRestore(); }
  });
});
