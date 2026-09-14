import { describe, expect, it } from "vitest";

import type { Tournament } from "@/api/types/tournaments";
import { displayName, formatTags } from "@/features/tournaments/lib/format";

const base = {
  name: "Daily MKO 3K",
  lobby_name: "Magic Chest",
  satellite_target: null,
  game_type: "nlh",
  bounty_kind: "mystery",
  early_bird_players: null,
  early_bird_bonus: "+50% фишек на 1-м уровне",
  has_jackpot: true,
  ticket_value: null,
} as unknown as Tournament;

describe("имя из лобби и то, что продаёт турнир", () => {
  it("показывает имя из лобби, а без него — с афиши", () => {
    expect(displayName(base)).toBe("Magic Chest");
    expect(displayName({ ...base, lobby_name: null })).toBe("Daily MKO 3K");
    expect(displayName({ ...base, satellite_target: "Main" })).toBe("Sat → Main");
  });

  it("KO не получает R+A, Early Bird и джекпот — метками", () => {
    expect(formatTags(base)).toEqual(["Mystery", "Early Bird", "Джекпот"]);
    expect(formatTags({ ...base, bounty_kind: "ko", has_jackpot: false })).toEqual([
      "KO",
      "Early Bird",
    ]);
    expect(formatTags({ ...base, bounty_kind: "none", early_bird_bonus: null })).toEqual([
      "R+A",
      "Джекпот",
    ]);
    expect(
      formatTags({ ...base, bounty_kind: "none", lobby_name: "FREEZEOUT", early_bird_bonus: null }),
    ).toEqual(["Джекпот"]);
  });
});
