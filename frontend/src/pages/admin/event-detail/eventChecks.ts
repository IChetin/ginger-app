import type { EventAdmin } from "@/api/types/admin";

export interface EventCheck {
  ok: boolean;
  message: string;
}

interface BlindRowLike {
  sb: string | number | null | undefined;
  bb: string | number | null | undefined;
  ante: string | number | null | undefined;
  minutes: number;
  is_break: boolean;
}

interface FlightRowLike {
  date: string;
}

function parseNum(value: string | number | null | undefined): number | null {
  if (value == null || value === "") {
    return null;
  }
  const n = typeof value === "number" ? value : Number(String(value).replace(/\s/g, ""));
  return Number.isFinite(n) ? n : null;
}

function displayLevelNumber(rows: BlindRowLike[], index: number): number | null {
  let level = 0;
  for (let i = 0; i <= index; i += 1) {
    const row = rows[i];
    if (!row || row.is_break) {
      continue;
    }
    level += 1;
    if (i === index) {
      return level;
    }
  }
  return null;
}

export function runEventChecks(params: {
  flights: FlightRowLike[];
  seriesStartsOn: string;
  seriesEndsOn: string;
  eventNumber: number | null;
  eventId: string;
  siblingEvents: Pick<EventAdmin, "id" | "number">[];
  blindLevels: BlindRowLike[];
}): EventCheck[] {
  const results: EventCheck[] = [];

  const allDatesOk = params.flights.every((flight) => {
    if (!flight.date) {
      return true;
    }
    return flight.date >= params.seriesStartsOn && flight.date <= params.seriesEndsOn;
  });
  results.push({
    ok: allDatesOk,
    message: allDatesOk ? "Даты флайтов внутри дат серии" : "Даты флайтов выходят за рамки серии",
  });

  const duplicate =
    params.eventNumber != null &&
    params.siblingEvents.some(
      (item) => item.id !== params.eventId && item.number === params.eventNumber,
    );
  results.push({
    ok: !duplicate,
    message: duplicate
      ? `Номер турнира #${params.eventNumber} уже занят в серии`
      : "Номер турнира уникален в серии",
  });

  const nonBreaks = params.blindLevels.filter((row) => !row.is_break);
  for (let i = 0; i < nonBreaks.length; i += 1) {
    const row = nonBreaks[i]!;
    const displayNo = i + 1;
    const bb = parseNum(row.bb);
    const ante = parseNum(row.ante);
    if (bb != null && bb > 0 && (ante == null || ante === 0)) {
      results.push({
        ok: false,
        message: `Структура: уровень ${displayNo} без анте`,
      });
    }
  }

  for (let i = 0; i < params.blindLevels.length; i += 1) {
    const row = params.blindLevels[i]!;
    if (row.minutes === 0) {
      const label = row.is_break
        ? "перерыв"
        : `уровень ${displayLevelNumber(params.blindLevels, i) ?? "?"}`;
      results.push({
        ok: false,
        message: `Структура: нулевая длительность (${label})`,
      });
    }
  }

  let prevBb: number | null = null;
  for (let i = 0; i < params.blindLevels.length; i += 1) {
    const row = params.blindLevels[i]!;
    if (row.is_break) {
      continue;
    }
    const bb = parseNum(row.bb);
    const displayNo = displayLevelNumber(params.blindLevels, i);
    if (bb != null && prevBb != null && bb < prevBb) {
      results.push({
        ok: false,
        message: `Структура: уровень ${displayNo} — BB меньше предыдущего`,
      });
    }
    if (bb != null) {
      prevBb = bb;
    }
  }

  return results;
}
