import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EditorsPickChip, EditorsPickPlate } from "@/features/picks/EditorsPick";
import { renderWithProviders } from "@/test/render";

describe("EditorsPick", () => {
  it("чип фильтра и объяснение по (?)", async () => {
    const onToggle = vi.fn();
    renderWithProviders(<EditorsPickChip kind="mtt" active={false} onToggle={onToggle} />);

    const chip = screen.getByRole("button", { name: /Editor's Pick/, pressed: false });
    fireEvent.click(chip);
    expect(onToggle).toHaveBeenCalledOnce();

    expect(screen.queryByTestId("editors-pick-help")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Что такое Editor's Pick" }));
    expect(await screen.findByTestId("editors-pick-help")).toHaveTextContent(
      "обновляем раз в неделю",
    );
  });

  it("плашка с заметкой", () => {
    renderWithProviders(<EditorsPickPlate note="Гарантия ×300 к бай-ину" />);
    expect(screen.getByTestId("editors-pick-plate")).toHaveTextContent("Гарантия ×300 к бай-ину");
  });
});
