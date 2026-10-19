import { expect, it } from "vitest";
import { cases } from "./cases.js";
import { processGpxInput } from "../../src/gpx/process.js";
import { policy } from "../helpers/phase-a.js";

// Offline preflight only: no browser, credentials, staging config or HTTP.
it.each(cases)("staging fixture is accepted with its independent expected subset: $name", fixture => {
  expect(processGpxInput(fixture.xml, policy)).toEqual(fixture.expected);
});
