import { test } from "node:test";
import assert from "node:assert/strict";
import {
  standings,
  admission,
  sportInput,
  scCity,
} from "../src/portal/sportRules";
const teams = [
  { id: "a", name: "A", crestUrl: "", groupName: "", pointsAdjustment: 0 },
  { id: "b", name: "B", crestUrl: "", groupName: "", pointsAdjustment: 0 },
  { id: "c", name: "C", crestUrl: "", groupName: "", pointsAdjustment: 0 },
];
const rules = {
  winPoints: 3,
  drawPoints: 1,
  lossPoints: 0,
  tieBreakers: ["points", "wins", "goalDifference", "goalsFor"],
};
test("sports table counts finished league matches only, preserves ties and recalculates corrected scores", () => {
  const game = {
    homeId: "a",
    awayId: "b",
    homeScore: 2,
    awayScore: 0,
    status: "finished",
    countsForStandings: true,
  };
  const rows = standings(
    teams,
    [
      game,
      { ...game, homeId: "c", status: "live" },
      { ...game, homeId: "c", countsForStandings: false },
    ],
    rules,
  );
  assert.equal(rows[0].id, "a");
  assert.equal(rows[0].points, 3);
  assert.equal(rows.find((x) => x.id === "c")?.played, 0);
  assert.equal(rows.find((x) => x.id === "b")?.goalsAgainst, 2);
  const corrected = standings(
    teams,
    [{ ...game, homeScore: 0, awayScore: 0 }],
    rules,
  );
  assert.equal(corrected.find((x) => x.id === "a")?.points, 1);
  assert.equal(corrected.find((x) => x.id === "b")?.rank, 1);
  assert.equal(
    standings(teams, [game], { ...rules, winPoints: 2 })[0].points,
    2,
  );
});
test("admission distinguishes donations from cash and billing is not multiplied by child events", () => {
  assert.deepEqual(admission("donation", "1 kg de alimento", 1000), {
    admissionType: "donation",
    donation: "1 kg de alimento",
    priceCents: 0,
  });
  assert.throws(() => admission("paid", "", 0));
  assert.throws(() => admission("donation", "", 0));
  assert.equal(
    sportInput({
      sport: "football",
      edition: "2026",
      date: "2026-11-01",
      sportEndDate: "2026-11-30",
      sportFormat: "championship",
      admissionType: "free",
    }).format,
    "championship",
  );
  assert.throws(() =>
    sportInput({
      sport: "invalid",
      edition: "2026",
      date: "2026-11-01",
      sportEndDate: "2026-11-30",
      sportFormat: "championship",
      admissionType: "free",
    }),
  );
});

test("edition dates are explicit and SC cities are validated", () => {
  assert.throws(() =>
    sportInput({
      sport: "football",
      edition: "2026",
      sportFormat: "championship",
      admissionType: "free",
      date: "2026-11-01",
    }),
  );
  assert.throws(() =>
    sportInput({
      sport: "football",
      edition: "2026",
      sportFormat: "championship",
      admissionType: "free",
      date: "2026-11-01",
      sportEndDate: "2026-10-01",
    }),
  );
  assert.equal(scCity("Florianopolis"), "Florianópolis");
  assert.throws(() => scCity("Porto Alegre"));
});
