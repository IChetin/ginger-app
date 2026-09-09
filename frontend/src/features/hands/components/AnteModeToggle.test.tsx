import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AnteModeToggle } from "@/features/hands/components/AnteModeToggle";

describe("AnteModeToggle", () => {
  it("uses styleguide segment size with a 44px touch target", () => {
    render(<AnteModeToggle mode="bb" onChange={vi.fn()} />);
    const bb = screen.getByRole("button", { name: "BB-анте" });
    const occupied = screen.getByRole("button", { name: "По сидящим" });
    expect(bb).toHaveAttribute("aria-pressed", "true");
    expect(occupied).toHaveAttribute("aria-pressed", "false");
    expect(bb.className).toMatch(/min-h-11/);
    expect(bb.className).toMatch(/min-w-11/);
    expect(occupied.className).toMatch(/min-h-11/);
    expect(occupied.className).toMatch(/min-w-11/);
  });

  it("shortens compact labels to BB and Все", () => {
    render(<AnteModeToggle compact mode="bb" onChange={vi.fn()} />);
    const toggle = screen.getByTestId("ante-mode-toggle");
    expect(toggle.className).toMatch(/w-\[90px\]/);
    expect(within(toggle).getByRole("button", { name: "BB" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(toggle).getByRole("button", { name: "Все" })).toBeInTheDocument();
    expect(within(toggle).queryByRole("button", { name: "BB-анте" })).not.toBeInTheDocument();
  });
});
