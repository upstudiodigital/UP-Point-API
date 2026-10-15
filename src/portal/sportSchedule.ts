import { SportError, string, scCity, link, coordinates } from "./sportRules";
import { parseProgramme, saveProgramme } from "./championshipSetup";
import type { Prisma } from "@prisma/client";
export const sportFields: Record<string, string[]> = {
  football: ["division", "duration"],
  futsal: ["division", "duration"],
  volleyball: ["division", "sets"],
  basketball: ["division", "duration"],
  running: [
    "distanceKm",
    "routeUrl",
    "registrationUrl",
    "kit",
    "accessibility",
  ],
  cycling: [
    "distanceKm",
    "routeUrl",
    "registrationUrl",
    "terrain",
    "accessibility",
  ],
  swimming: [
    "distanceMeters",
    "stroke",
    "poolMeters",
    "lane",
    "registrationUrl",
    "accessibility",
  ],
  athletics: [
    "discipline",
    "distanceMeters",
    "registrationUrl",
    "accessibility",
  ],
  karate: [
    "discipline",
    "ageGroup",
    "weightClass",
    "belt",
    "area",
    "registrationUrl",
    "accessibility",
  ],
  jiujitsu: [
    "ageGroup",
    "weightClass",
    "belt",
    "area",
    "registrationUrl",
    "accessibility",
  ],
  judo: [
    "ageGroup",
    "weightClass",
    "belt",
    "area",
    "registrationUrl",
    "accessibility",
  ],
  taekwondo: [
    "discipline",
    "ageGroup",
    "weightClass",
    "belt",
    "area",
    "registrationUrl",
    "accessibility",
  ],
  boxing: [
    "ageGroup",
    "weightClass",
    "area",
    "registrationUrl",
    "accessibility",
  ],
  triathlon: ["distanceKm", "routeUrl", "registrationUrl", "accessibility"],
  tennis: ["division", "area", "registrationUrl", "accessibility"],
};
export function decodeProgramme(value: unknown): Record<string, unknown> {
  let input: unknown = value;
  if (typeof input === "string") {
    try {
      input = JSON.parse(input);
    } catch {
      throw new SportError(400, "Confira equipes e programação do campeonato.");
    }
  }
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new SportError(400, "Adicione a programação antes de continuar.");
  return input as Record<string, unknown>;
}
export function normaliseScheduleBody(body: Record<string, unknown>) {
  if (body.category !== "Esportes" || body.scheduleVersion !== "2") return body;
  const p = decodeProgramme(body.programme);
  const rows =
    body.sport === "football" && body.sportFormat === "championship"
      ? p.matches
      : p.sessions;
  if (!Array.isArray(rows) || !rows.length)
    throw new SportError(400, "Adicione a programação antes de continuar.");
  const sorted = rows
    .map((row) => {
      if (!row || typeof row !== "object")
        throw new SportError(400, "Confira a programação.");
      return row as Record<string, unknown>;
    })
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const first = sorted[0],
    last = sorted[sorted.length - 1];
  return {
    ...body,
    date: first.date,
    time: first.time,
    venue: first.venue,
    city: first.city,
    streetAddress: first.address,
    sportEndDate: body.sportEndDate || last.date,
  };
}
export function parseSession(
  raw: unknown,
  sport: string,
  startsOn: string,
  endsOn: string,
) {
  if (!raw || typeof raw !== "object")
    throw new SportError(400, "Confira a programação.");
  const s = raw as Record<string, unknown>,
    date = string(s.date, 10, 10),
    time = string(s.time, 5, 5);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date ||
    date < startsOn ||
    date > endsOn ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  )
    throw new SportError(400, "Confira as datas e os horários da programação.");
  const details: Record<string, string> = {};
  const source =
    s.details && typeof s.details === "object"
      ? (s.details as Record<string, unknown>)
      : {};
  for (const field of sportFields[sport] ?? []) {
    const value = source[field];
    if (value == null || value === "") continue;
    if (["routeUrl", "registrationUrl"].includes(field))
      details[field] = link(value);
    else {
      details[field] = string(value, 1, 1000);
      if (
        ["distanceKm", "distanceMeters", "poolMeters"].includes(field) &&
        (!Number.isFinite(Number(value)) ||
          Number(value) <= 0 ||
          Number(value) > 100000)
      )
        throw new SportError(400, "Informe uma distância válida.");
    }
  }
  if (
    ["running", "cycling", "triathlon"].includes(sport) &&
    !details.distanceKm
  )
    throw new SportError(400, "Informe a distância da prova.");
  if (
    sport === "karate" &&
    !["Kata", "Kumite", "Kata e Kumite"].includes(details.discipline)
  )
    throw new SportError(400, "Selecione Kata ou Kumite para o karatê.");
  const officials =
    typeof s.officials === "string"
      ? s.officials
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const [role, ...name] = line.split("|");
            return {
              role: string(role, 2, 100),
              name: string(name.join("|"), 2, 120),
            };
          })
      : Array.isArray(s.officials)
        ? s.officials.map((raw) => {
            if (!raw || typeof raw !== "object")
              throw new SportError(400, "Confira a arbitragem.");
            const p = raw as Record<string, unknown>;
            return {
              role: string(p.role, 2, 100),
              name: string(p.name, 2, 120),
            };
          })
        : [];
  if (officials.length > 12) throw new SportError(400, "Confira a arbitragem.");
  return {
    title: string(s.title, 3, 160),
    category:
      typeof s.category === "string" ? s.category.trim().slice(0, 120) : "",
    date,
    time,
    venue: string(s.venue, 3, 200),
    city: scCity(s.city),
    address: string(s.address, 5, 300),
    ...coordinates(s),
    details,
    officials,
    officialsConfirmed: s.officialsConfirmed === true,
    status:
      s.status === undefined
        ? "scheduled"
        : ["scheduled", "completed", "cancelled"].includes(String(s.status))
          ? String(s.status)
          : (() => {
              throw new SportError(400, "Confira a situação da atividade.");
            })(),
  };
}
export interface ParsedSportSchedule {
  football?: ReturnType<typeof parseProgramme>;
  teams: { name: string; crestUrl: string; groupName: string }[];
  sessions: ReturnType<typeof parseSession>[];
}
export function parseSportSchedule(
  value: unknown,
  sport: string,
  format: string,
  startsOn: string,
  endsOn: string,
): ParsedSportSchedule {
  if (sport === "football" && format === "championship")
    return {
      football: parseProgramme(value, startsOn, endsOn),
      teams: [],
      sessions: [],
    };
  const p = decodeProgramme(value);
  if (
    !Array.isArray(p.sessions) ||
    !p.sessions.length ||
    p.sessions.length > 500
  )
    throw new SportError(400, "Adicione a programação antes de continuar.");
  const sessions = p.sessions.map((s) =>
    parseSession(s, sport, startsOn, endsOn),
  );
  const teams = Array.isArray(p.teams)
    ? p.teams.map((raw) => {
        const t = raw as Record<string, unknown>;
        if (!t || typeof t !== "object")
          throw new SportError(400, "Confira os clubes participantes.");
        return {
          name: string(t.name, 2, 100),
          crestUrl: link(t.crestUrl),
          groupName:
            typeof t.groupName === "string"
              ? t.groupName.trim().slice(0, 50)
              : "",
        };
      })
    : [];
  if (
    teams.length > 64 ||
    new Set(teams.map((t) => t.name.toLowerCase())).size !== teams.length
  )
    throw new SportError(400, "Esta equipe já está cadastrada.");
  return { football: undefined, teams, sessions };
}
export async function saveSportSchedule(
  tx: Prisma.TransactionClient,
  competitionId: string,
  p: ReturnType<typeof parseSportSchedule>,
) {
  if (p.football) await saveProgramme(tx, competitionId, p.football);
  else {
    if (p.teams.length)
      await tx.sportTeam.createMany({
        data: p.teams.map((t) => ({ ...t, competitionId })),
      });
    for (const s of p.sessions)
      await tx.sportSession.create({ data: { ...s, competitionId } });
  }
}
