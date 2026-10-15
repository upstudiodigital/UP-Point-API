import { scCities } from "../data/scCities";
export const sportKinds = [
  "football",
  "futsal",
  "volleyball",
  "basketball",
  "triathlon",
  "tennis",
  "running",
  "swimming",
  "athletics",
  "cycling",
  "jiujitsu",
  "judo",
  "karate",
  "taekwondo",
  "boxing",
] as const;
export class SportError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function string(value: unknown, min = 1, max = 160) {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.trim().length > max
  )
    throw new SportError(400, "Confira os campos obrigatórios.");
  return value.trim();
}
export function integer(value: unknown, min = 0, max = 100) {
  const number = Number(value);
  if (
    value === null ||
    value === "" ||
    typeof value === "boolean" ||
    !Number.isSafeInteger(number) ||
    number < min ||
    number > max
  )
    throw new SportError(400, "Confira os campos obrigatórios.");
  return number;
}
export function coordinates(body: Record<string, unknown>) {
  const read = (value: unknown, max: number) => {
    if (value == null || value === "") return null;
    const n = Number(value);
    if (!Number.isFinite(n) || Math.abs(n) > max)
      throw new SportError(400, "Coordenadas inválidas.");
    return n;
  };
  const latitude = read(body.latitude, 90),
    longitude = read(body.longitude, 180);
  if ((latitude === null) !== (longitude === null))
    throw new SportError(400, "Informe as duas coordenadas.");
  return { latitude, longitude };
}
export function oneOf(value: unknown, options: readonly string[]) {
  if (typeof value !== "string" || !options.includes(value))
    throw new SportError(400, "Confira os campos obrigatórios.");
  return value;
}
export function link(value: unknown) {
  if (value == null || value === "") return "";
  const s = string(value, 1, 500);
  try {
    const url = new URL(s);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw Error();
    return url.href;
  } catch {
    throw new SportError(400, "Informe um link válido.");
  }
}
export function admission(
  type: unknown,
  donation: unknown,
  priceCents: unknown,
  inherit = false,
) {
  const admissionType = oneOf(
    type,
    inherit
      ? ["inherit", "free", "paid", "donation", "mixed"]
      : ["free", "paid", "donation", "mixed"],
  );
  return {
    admissionType,
    donation: ["donation", "mixed"].includes(admissionType)
      ? string(donation, 3, 250)
      : "",
    priceCents: ["paid", "mixed"].includes(admissionType)
      ? integer(priceCents, 1, 10000000)
      : 0,
  };
}
export function sportInput(body: Record<string, unknown>) {
  const sport = oneOf(body.sport, sportKinds),
    edition = string(body.edition, 1, 50),
    format = oneOf(body.sportFormat, [
      "championship",
      "meeting",
      "circuit_stage",
    ]);
  const a = admission(body.admissionType, body.donation, body.priceCents);
  const startsOn = string(body.date, 10, 10),
    endsOn = body.sportEndDate || (format === "championship" ? "" : startsOn);
  if (
    typeof endsOn !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endsOn) ||
    !Number.isFinite(Date.parse(endsOn)) ||
    new Date(endsOn).toISOString().slice(0, 10) !== endsOn ||
    endsOn < startsOn
  )
    throw new SportError(400, "Confira o período desta edição.");
  return {
    startsOn,
    endsOn,
    sport,
    edition,
    format,
    admissionType: a.admissionType,
    donation: a.donation,
    rulesUrl: link(body.rulesUrl),
    winPoints: integer(body.winPoints ?? 3, 0, 100),
    drawPoints: integer(body.drawPoints ?? 1, 0, 100),
    lossPoints: integer(body.lossPoints ?? 0, 0, 100),
  };
}
export interface TableTeam {
  id: string;
  name: string;
  crestUrl: string;
  groupName: string;
  pointsAdjustment: number;
}
export interface TableMatch {
  homeId: string;
  awayId: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  countsForStandings: boolean;
}
export function standings(
  teams: TableTeam[],
  matches: TableMatch[],
  rules: {
    winPoints: number;
    drawPoints: number;
    lossPoints: number;
    tieBreakers: string[];
  },
) {
  const rows = teams.map((team) => ({
    ...team,
    points: team.pointsAdjustment,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
  }));
  const lookup = new Map(rows.map((x) => [x.id, x]));
  for (const match of matches) {
    if (
      match.status !== "finished" ||
      !match.countsForStandings ||
      match.homeScore == null ||
      match.awayScore == null
    )
      continue;
    const home = lookup.get(match.homeId),
      away = lookup.get(match.awayId);
    if (!home || !away) continue;
    home.played++;
    away.played++;
    home.goalsFor += match.homeScore;
    home.goalsAgainst += match.awayScore;
    away.goalsFor += match.awayScore;
    away.goalsAgainst += match.homeScore;
    if (match.homeScore === match.awayScore) {
      home.draws++;
      away.draws++;
      home.points += rules.drawPoints;
      away.points += rules.drawPoints;
    } else {
      const win = match.homeScore > match.awayScore ? home : away,
        lose = win === home ? away : home;
      win.wins++;
      lose.losses++;
      win.points += rules.winPoints;
      lose.points += rules.lossPoints;
    }
  }
  rows.forEach((row) => (row.goalDifference = row.goalsFor - row.goalsAgainst));
  type Metric = "points" | "wins" | "goalDifference" | "goalsFor";
  const compare = (a: (typeof rows)[number], b: (typeof rows)[number]) => {
    for (const key of rules.tieBreakers) {
      const diff = b[key as Metric] - a[key as Metric];
      if (diff) return diff;
    }
    return 0;
  };
  rows.sort(
    (a, b) =>
      a.groupName.localeCompare(b.groupName) ||
      compare(a, b) ||
      a.name.localeCompare(b.name),
  );
  let position = 0,
    rank = 0,
    group = "";
  return rows.map((row, index) => {
    if (index === 0 || row.groupName !== group) {
      group = row.groupName;
      position = 0;
      rank = 0;
    }
    position++;
    if (position === 1 || compare(rows[index - 1], row) !== 0) rank = position;
    return { ...row, rank };
  });
}

export function scCity(value: unknown) {
  const name = string(value, 2, 120);
  const normalize = (v: string) =>
    v
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const city = scCities.find((c) => normalize(c) === normalize(name));
  if (!city)
    throw new SportError(400, "Selecione uma cidade de Santa Catarina.");
  return city;
}
