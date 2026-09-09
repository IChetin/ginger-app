import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FilterSheet } from "@/components/filters/FilterSheet";

const groups = [
  {
    id: "countries",
    title: "Страна",
    options: [
      { value: "RU", label: "Россия", count: 2 },
      { value: "BY", label: "Беларусь", count: 1 },
    ],
  },
  {
    id: "buyin",
    title: "Бай-ин",
    options: [
      { value: "lt10k", label: "до 10 тыс. ₽" },
      { value: "10-50k", label: "10–50 тыс. ₽" },
    ],
  },
  {
    id: "organizers",
    title: "Организатор",
    options: [{ value: "org-1", label: "RPT", count: 1 }],
  },
  {
    id: "period",
    title: "Период",
    mode: "single" as const,
    options: [
      { value: "month", label: "Ближайший месяц" },
      { value: "3m", label: "3 месяца" },
    ],
  },
];

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
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

const sheetProps = {
  open: true,
  onOpenChange: () => undefined,
  title: "Фильтры",
  groups,
  values: { countries: [], buyin: [], organizers: [], period: [] },
  onChange: () => undefined,
  resultCount: 3,
  resultWords: ["серию", "серии", "серий"] as const,
  onApply: () => undefined,
  onReset: () => undefined,
};

describe("FilterSheet layout", () => {
  it("mobile: definite height + apply button", () => {
    mockMatchMedia(false);
    render(<FilterSheet {...sheetProps} />);

    const popup = screen.getByTestId("filter-sheet-mobile");
    expect(popup.className).toMatch(/h-\[86vh\]/);
    expect(popup.querySelector(".flex-1.min-h-0.overflow-y-auto")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Показать 3 серии" })).toBeInTheDocument();
    expect(screen.getByText("Страна")).toBeInTheDocument();
  });

  it("desktop: portal panel with definite height, no apply button", () => {
    mockMatchMedia(true);
    render(<FilterSheet {...sheetProps} />);

    expect(screen.queryByTestId("filter-sheet-mobile")).toBeNull();
    const panel = screen.getByTestId("filter-panel-desktop");
    expect(panel.parentElement).toBe(document.body);

    const aside = panel.querySelector("aside");
    expect(aside?.className).toMatch(/h-dvh/);
    expect(aside?.className).toMatch(/max-w-\[400px\]|w-\[min\(100%,400px\)\]/);
    expect(panel.querySelector(".flex-1.min-h-0.overflow-y-auto")).not.toBeNull();

    expect(screen.queryByRole("button", { name: /Показать/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Сбросить" })).toBeInTheDocument();
    expect(screen.getByText("Страна")).toBeInTheDocument();
    expect(screen.getByText("Бай-ин")).toBeInTheDocument();
    expect(screen.getByText("Организатор")).toBeInTheDocument();
    expect(screen.getByText("Период")).toBeInTheDocument();
  });
});
