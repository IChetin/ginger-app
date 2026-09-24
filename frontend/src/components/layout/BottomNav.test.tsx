import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { BottomNav } from "@/components/layout/BottomNav";

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
    </MemoryRouter>,
  );
}

describe("BottomNav", () => {
  it("внутри переписки меню нет — низ экрана отдан полю ввода", () => {
    renderAt("/dialogs/th1");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("в списке диалогов и в «Написать» меню на месте", () => {
    renderAt("/dialogs");
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });

  it("на экране нового обращения меню тоже на месте", () => {
    renderAt("/dialogs/new");
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });
});
