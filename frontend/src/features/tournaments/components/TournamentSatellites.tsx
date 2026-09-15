import { useQuery } from "@tanstack/react-query";

import type { Tournament } from "@/api/types/tournaments";
import { formatMoney, formatStartShort } from "@/features/tournaments/lib/format";
import { fetchTournamentSatellites } from "@/features/tournaments/liveApi";

/**
 * «Попасть дешевле»: сателлиты на турнир — только в карточке турнира. В списке метка «SAT»
 * путала бы: игрок решил бы, что это сам турнир-сателлит (Иван, 15.09).
 */
export function TournamentSatellites({ tournament }: { tournament: Tournament }) {
  const enabled = !tournament.satellite_target && !tournament.live_event;
  const query = useQuery({
    queryKey: ["tournaments", "satellites", tournament.id],
    queryFn: ({ signal }) => fetchTournamentSatellites(tournament.id, signal),
    enabled,
    staleTime: 60_000,
  });
  if (!enabled || !query.data || query.data.length === 0) return null;

  return (
    <section className="mt-4" data-testid="tournament-satellites">
      <h3 className="text-ink-3 mb-1 text-[11px] font-bold tracking-[0.08em] uppercase">
        Попасть дешевле · сателлиты
      </h3>
      <ul className="border-line rounded-md border">
        {query.data.map((item) => (
          <li
            key={item.id}
            className="border-line flex items-center gap-2 border-t px-3 py-2 text-[13px] first:border-t-0"
          >
            <span className="num text-ink-2 w-[92px] shrink-0 text-[12px]">
              {formatStartShort(item.starts_at)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-ink block truncate font-semibold">
                {item.lobby_name ?? item.name}
              </span>
              {item.notes ? (
                <span className="text-ink-3 block truncate text-[11.5px]">{item.notes}</span>
              ) : null}
            </span>
            <span className="num text-ink shrink-0 font-bold">
              {formatMoney(item.buyin, item.club)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Турнир из пути в живую серию: какое событие, когда и какой это шаг. */
export function LivePlate({ tournament }: { tournament: Tournament }) {
  if (!tournament.live_event) return null;
  const step = tournament.live_step
    ? `шаг ${tournament.live_step} пути в серию`
    : "турнир серии — вход по билету";
  return (
    <div
      data-testid="live-plate"
      className="bg-danger-soft mt-3 rounded-md border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] px-3 py-2"
    >
      <p className="text-ink text-[14px] font-bold">
        <span className="bg-danger mr-1.5 rounded-[4px] px-1 align-[1px] text-[10px] font-extrabold tracking-[0.06em] text-white">
          LIVE
        </span>
        {tournament.live_event}
      </p>
      <p className="text-ink-2 mt-0.5 text-[12.5px]">
        {[tournament.live_dates, step].filter(Boolean).join(" · ")}
      </p>
    </div>
  );
}
