import type { VenueBrief } from "@/api/types/schedule";

const iconClass =
  "h-5 w-5 stroke-current fill-none [stroke-width:1.8] [stroke-linecap:round] [stroke-linejoin:round]";

type Props = {
  venue: VenueBrief;
};

export function VenueCard({ venue }: Props) {
  const addressParts = [
    venue.address ?? `${venue.city}`,
    venue.zone ? `зона «${venue.zone}»` : null,
  ].filter(Boolean);

  return (
    <section className="mt-5 px-4" data-testid="venue-card">
      <h2 className="mb-2.5 text-[17px] font-extrabold">Где играем</h2>
      <div className="border-line bg-surface flex min-h-11 items-center gap-3 rounded-md border p-3.5">
        <div className="bg-gold-soft text-gold flex h-10 w-10 shrink-0 items-center justify-center rounded-md">
          <svg className={iconClass} viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
        </div>
        <div className="min-w-0">
          <div className="text-[15px] font-bold">{venue.name}</div>
          <div className="text-ink-3 text-xs">{addressParts.join(" · ")}</div>
        </div>
      </div>
    </section>
  );
}
