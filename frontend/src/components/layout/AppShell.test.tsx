import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/layout/AppShell";
import { renderWithProviders } from "@/test/render";

vi.mock("@/features/auth/hooks", () => ({
  useMe: () => ({ data: null }),
}));

vi.mock("@/features/bookmarks/hooks", () => ({
  useBookmarkCount: () => 0,
}));

vi.mock("@/features/live/hooks", () => ({
  useActiveLiveSession: () => ({ data: null }),
}));

vi.mock("@/features/hands/lib/draftSync", () => ({
  registerHandDraftSyncTriggers: () => () => undefined,
}));

function renderShell(route: string) {
  return renderWithProviders(
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/hand/:slug" element={<div>hand</div>} />
        <Route path="/" element={<div>home</div>} />
      </Route>
    </Routes>,
    { route },
  );
}

describe("AppShell hand width", () => {
  it("keeps the 420 column for a draft and a published hand", () => {
    renderShell("/hand/abc");
    const shell = screen.getByTestId("mobile-shell");
    expect(shell.className).toMatch(/max-w-\[420px\]/);
    expect(shell.className).not.toMatch(/max-w-none/);
    expect(shell.getAttribute("data-wide-hand")).toBeNull();
  });
});
