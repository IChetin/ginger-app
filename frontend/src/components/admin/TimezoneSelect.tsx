import { useMemo, useState } from "react";

import { adminInputClass } from "@/components/admin/FlightRowsEditor";
import { formatUtcOffset, listIanaTimeZones } from "@/lib/timezoneOffset";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (value: string) => void;
  id?: string;
}

export function TimezoneSelect({ value, onChange, id }: Props) {
  const [query, setQuery] = useState("");
  const zones = useMemo(() => listIanaTimeZones(), []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return zones;
    return zones.filter((zone) => zone.toLowerCase().includes(q));
  }, [query, zones]);

  return (
    <div className="space-y-2">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Поиск IANA-зоны…"
        className={adminInputClass}
      />
      <select
        id={id}
        className={cn(adminInputClass, "font-mono text-[13px]")}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        size={Math.min(8, Math.max(4, filtered.length))}
      >
        {filtered.map((zone) => (
          <option key={zone} value={zone}>
            {zone} — {formatUtcOffset(zone)}
          </option>
        ))}
      </select>
      {value ? (
        <p className="text-ink-3 font-mono text-xs">
          Выбрано: {value} <span className="text-gold">{formatUtcOffset(value)}</span>
        </p>
      ) : null}
    </div>
  );
}
