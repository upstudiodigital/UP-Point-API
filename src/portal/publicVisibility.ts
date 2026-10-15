import type { Prisma } from "@prisma/client";
import { activePublication } from "./publicationPeriod";
// One policy for every public entry point. Unpaid, expired or blocked ads stay private.
export function publicEventWhere(): Prisma.EventsWhereInput {
  return {
    status: true,
    moderationStatus: "approved",
    country: "BR",
    state: "SC",
    userOwner: { status: true },
    orders: { some: { status: { in: ["paid", "free"] } } },
    AND: [activePublication()],
  };
}
