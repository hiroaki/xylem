// Application policy contracts live in this module.
// This file defines policy types only.
// Do not add default values, environment parsing,
// or schema/domain invariants here.
// Runtime values are created by config.ts.

export type GpxPolicy = {
  maxRawBytes: number;
  maxTotalPoints: number;
  maxNameLength: number;
};
