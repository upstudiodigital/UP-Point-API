import { scToday } from "./publicationPeriod";
import { PaymentError } from "./pagbank";
export function assertPayablePeriod(
  order: {
    advertisingUntil: string;
    event: { dateEvent: string; sportCompetition?: { endsOn: string } | null };
  },
  today = scToday(),
) {
  const last =
    order.advertisingUntil ||
    order.event.sportCompetition?.endsOn ||
    order.event.dateEvent;
  if (last < today)
    throw new PaymentError(
      409,
      "O período deste anúncio terminou. Cadastre um novo evento antes de pagar.",
    );
}
