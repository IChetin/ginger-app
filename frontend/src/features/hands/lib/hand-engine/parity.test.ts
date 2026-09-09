import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { HandData } from "@/api/types/hands";
import { buildTimeline, getStateAtStep } from "@/features/hands/lib/hand-engine";

interface ParityCase {
  id: string;
  note: string;
  expectMismatch?: string;
  data: HandData;
}

interface ParityFile {
  cases: ParityCase[];
}

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__/parity.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as ParityFile;

function snapshots(data: HandData) {
  const timeline = buildTimeline(data).filter((item) => item.kind !== "showdown");
  return timeline.map((_, step) => {
    const state = getStateAtStep(data, step);
    return {
      kind: state.isDeal ? "deal" : state.lastAction ? "action" : "post",
      street: state.street,
      pot: state.pot,
      currentBet: state.currentBet,
      actorSeat: state.actorSeat,
      heroInvested: state.heroInvested,
    };
  });
}

describe("hand-engine parity fixtures (frontend)", () => {
  it.each(fixture.cases)("$id — $note", (item) => {
    const steps = snapshots(item.data);
    expect(steps.length).toBeGreaterThan(0);
    const last = steps.at(-1);
    if (item.id === "fold-win") {
      expect(last?.pot).toBe(1500);
    }
    if (item.id === "uncalled-raise") {
      expect(last?.pot).toBe(2000);
      expect(last?.heroInvested).toBe(1000);
    }
    if (item.id === "allin-uncalled") {
      const flop = steps.find((step) => step.kind === "deal" && step.street === "flop");
      expect(flop?.pot).toBe(160_000);
    }
    if (item.id === "dead-button") {
      expect(steps[0]?.pot).toBe(5000);
    }
    if (item.id === "heads-up") {
      expect(steps[0]?.pot).toBe(1500);
      expect(steps[0]?.actorSeat).toBe(1);
    }
  });
});
