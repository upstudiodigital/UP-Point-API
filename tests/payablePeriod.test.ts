import { test } from "node:test";
import assert from "node:assert/strict";
import { assertPayablePeriod } from "../src/portal/payablePeriod";
test("new charges reject ended ads and respect the last date of a multiday competition", () => {
  assert.throws(() =>
    assertPayablePeriod(
      { advertisingUntil: "", event: { dateEvent: "2026-10-14" } },
      "2026-10-15",
    ),
  );
  assert.doesNotThrow(() =>
    assertPayablePeriod(
      {
        advertisingUntil: "",
        event: {
          dateEvent: "2026-10-14",
          sportCompetition: { endsOn: "2026-10-16" },
        },
      },
      "2026-10-15",
    ),
  );
  assert.throws(() =>
    assertPayablePeriod(
      {
        advertisingUntil: "2026-10-14",
        event: {
          dateEvent: "2026-10-14",
          sportCompetition: { endsOn: "2026-12-01" },
        },
      },
      "2026-10-15",
    ),
  );
});
