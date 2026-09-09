import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StackDisplayToggle } from "@/features/hands/components/StackDisplayToggle";

describe("StackDisplayToggle", () => {
  it("uses styleguide segment size with a 44px touch target", () => {
    render(<StackDisplayToggle mode="chips" onChange={vi.fn()} />);
    const chips = screen.getByRole("button", { name: "Фишки" });
    const bb = screen.getByRole("button", { name: "BB" });
    expect(chips.className).toMatch(/min-h-11/);
    expect(chips.className).toMatch(/min-w-11/);
    expect(chips.className).toMatch(/text-\[13px\]/);
    expect(bb.className).toMatch(/min-h-11/);
    expect(bb.className).toMatch(/min-w-11/);
  });

  it("uses ₽ / BB labels when compact", () => {
    render(<StackDisplayToggle compact mode="chips" onChange={vi.fn()} />);
    const chips = screen.getByRole("button", { name: "Фишки" });
    expect(chips.textContent).toContain("₽");
    expect(chips.className).not.toMatch(/min-h-11/);
    expect(chips.className).toMatch(/shrink-0|min-w-0/);
  });

  it("keeps Фишки when BB is first", () => {
    render(<StackDisplayToggle compact bbFirst mode="bb" onChange={vi.fn()} />);
    const chips = screen.getByRole("button", { name: "Фишки" });
    expect(chips.textContent).toBe("Фишки");
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveAccessibleName("BB");
    expect(buttons[1]).toHaveAccessibleName("Фишки");
  });
});
