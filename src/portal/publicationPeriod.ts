import type { Prisma } from "@prisma/client";
import { SportError } from "./sportRules";
export function scToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function calendarMonths(from: string, through: string) {
  const valid = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
  if (!valid(from) || !valid(through) || through < from) throw new SportError(400, "Confira o período de divulgação.");
  const [y,m,d] = from.split("-").map(Number);
  // Coverage is inclusive. Calendar months are anchored to the initial day,
  // clamping anniversaries at month-end (e.g. January 31 -> February 28).
  for (let count=1; count<=60; count++) {
    const last = new Date(Date.UTC(y,m-1+count+1,0)).getUTCDate();
    const exclusive = new Date(Date.UTC(y,m-1+count,Math.min(d,last))).toISOString().slice(0,10);
    if (through < exclusive) return count;
  }
  throw new SportError(400, "O período de divulgação pode ter até 60 meses.");
}
export function publicationPeriod(body: Record<string,unknown>, end: string, now = scToday()) {
  const advertisingFrom = typeof body.advertisingFrom === "string" && body.advertisingFrom ? body.advertisingFrom : now;
  const advertisingUntil = typeof body.advertisingUntil === "string" && body.advertisingUntil ? body.advertisingUntil : end;
  const billedMonths = calendarMonths(advertisingFrom, advertisingUntil);
  if (advertisingFrom < now || advertisingUntil > end) throw new SportError(400, "Confira o período de divulgação.");
  return { advertisingFrom, advertisingUntil, billedMonths, monthlyRateCents: 5000 };
}
export function activePublication(today = scToday()): Prisma.EventsWhereInput {
  return { OR: [
    { sportCompetition: { is: null }, dateEvent: { gte: today } },
    { sportCompetition: { is: { format: { not: "championship" } } }, dateEvent: { gte: today } },
    { sportCompetition: { is: { format: "championship", endsOn: { gte: today }, AND: [
      { OR: [{ advertisingFrom: "" }, { advertisingFrom: { lte: today } }] },
      { OR: [{ advertisingUntil: "" }, { advertisingUntil: { gte: today } }] }
    ] } } }
  ] };
}
