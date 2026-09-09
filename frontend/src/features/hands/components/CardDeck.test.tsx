import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CardDeck } from "@/features/hands/components/CardDeck";
import { consumeDeckKey, DECK_RANKS } from "@/features/hands/lib/deckKeys";

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("min-width: 640px") ? matches : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("consumeDeckKey", () => {
  it("собирает As из двух нажатий", () => {
    expect(consumeDeckKey("", "A")).toEqual({ buffer: "A", card: null });
    expect(consumeDeckKey("A", "s")).toEqual({ buffer: "", card: "As" });
  });

  it("принимает нижний регистр и 10 как T", () => {
    expect(consumeDeckKey("", "a")).toEqual({ buffer: "A", card: null });
    expect(consumeDeckKey("A", "H")).toEqual({ buffer: "", card: "Ah" });
    expect(consumeDeckKey("", "1")).toEqual({ buffer: "1", card: null });
    expect(consumeDeckKey("1", "0")).toEqual({ buffer: "T", card: null });
    expect(consumeDeckKey("T", "d")).toEqual({ buffer: "", card: "Td" });
  });

  it("при ошибке начинает набор заново с ранга", () => {
    expect(consumeDeckKey("A", "K")).toEqual({ buffer: "K", card: null });
    expect(consumeDeckKey("K", "c")).toEqual({ buffer: "", card: "Kc" });
  });
});

describe("CardDeck", () => {
  it("ранги A→2 одинаковы во всех мастях", () => {
    mockMatchMedia(true);
    render(<CardDeck selected={[]} used={new Set()} onToggle={() => undefined} />);
    const expected = ["s", "h", "d", "c"].flatMap((suit) => DECK_RANKS.map((rank) => `${rank}${suit}`));
    expect(screen.getAllByRole("button").map((el) => el.getAttribute("aria-label"))).toEqual(expected);
  });

  it("на десктопе четыре строки по 13 карт и блок не шире 560px", () => {
    mockMatchMedia(true);
    const { container } = render(<CardDeck selected={[]} used={new Set()} onToggle={() => undefined} />);
    const root = container.firstElementChild;
    expect(root?.className).toMatch(/max-w-\[560px\]/);
    expect(root?.className).toMatch(/mx-auto/);
    const rows = screen.getAllByTestId("deck-row");
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.querySelectorAll("button")).toHaveLength(13);
      expect(row.className).toMatch(/gap-\[5px\]/);
      expect(row.className).toMatch(/repeat\(13,minmax\(0,40px\)\)/);
    }
  });

  it("на мобильном масть в две строки 7+6", () => {
    mockMatchMedia(false);
    const { container } = render(<CardDeck selected={[]} used={new Set()} onToggle={() => undefined} />);
    const root = container.firstElementChild;
    expect(root?.className).not.toMatch(/max-w-\[560px\]/);
    const rows = screen.getAllByTestId("deck-row");
    expect(rows).toHaveLength(8);
    expect(rows[0]?.querySelectorAll("button")).toHaveLength(7);
    expect(rows[1]?.querySelectorAll("button")).toHaveLength(6);
  });

  it("недоступную карту нельзя выбрать", async () => {
    mockMatchMedia(true);
    const onToggle = vi.fn();
    render(<CardDeck selected={[]} used={new Set(["As"])} onToggle={onToggle} />);
    const usedCard = screen.getByRole("button", { name: "As" });
    expect(usedCard).toBeDisabled();
    expect(usedCard.className).toMatch(/opacity-25/);
    expect(usedCard.className).toMatch(/cursor-not-allowed/);
    await userEvent.click(usedCard);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("выбор не меняет размер ячейки", () => {
    mockMatchMedia(true);
    const { rerender } = render(<CardDeck selected={[]} used={new Set()} onToggle={() => undefined} />);
    const idle = screen.getByRole("button", { name: "As" }).className;
    rerender(<CardDeck selected={["As"]} used={new Set(["As"])} onToggle={() => undefined} />);
    const chosen = screen.getByRole("button", { name: "As" }).className;
    expect(idle).toMatch(/h-\[54px\]/);
    expect(chosen).toMatch(/h-\[54px\]/);
    expect(screen.getByRole("button", { name: "As" })).toHaveStyle({
      backgroundColor: "#FBF8F0",
    });
    expect(chosen).not.toMatch(/scale-/);
    expect(chosen).toMatch(/w-full/);
    expect(idle).toMatch(/w-full/);
  });

  it("на десктопе ввод As выбирает карту", () => {
    mockMatchMedia(true);
    const onToggle = vi.fn();
    render(<CardDeck selected={[]} used={new Set()} onToggle={onToggle} />);
    fireEvent.keyDown(window, { key: "A" });
    fireEvent.keyDown(window, { key: "s" });
    expect(onToggle).toHaveBeenCalledWith("As");
  });

  it("клавиатура не выбирает уже занятую карту", () => {
    mockMatchMedia(true);
    const onToggle = vi.fn();
    render(<CardDeck selected={["Kh"]} used={new Set(["As", "Kh"])} onToggle={onToggle} />);
    fireEvent.keyDown(window, { key: "A" });
    fireEvent.keyDown(window, { key: "s" });
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("на мобильном клавиатура не выбирает карту", () => {
    mockMatchMedia(false);
    const onToggle = vi.fn();
    render(<CardDeck selected={[]} used={new Set()} onToggle={onToggle} />);
    fireEvent.keyDown(window, { key: "A" });
    fireEvent.keyDown(window, { key: "s" });
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("не перехватывает ввод в текстовом поле", () => {
    mockMatchMedia(true);
    const onToggle = vi.fn();
    render(
      <div>
        <textarea aria-label="заметка" />
        <CardDeck selected={[]} used={new Set()} onToggle={onToggle} />
      </div>,
    );
    const note = screen.getByRole("textbox", { name: "заметка" });
    fireEvent.keyDown(note, { key: "A" });
    fireEvent.keyDown(note, { key: "s" });
    expect(onToggle).not.toHaveBeenCalled();
  });
});
