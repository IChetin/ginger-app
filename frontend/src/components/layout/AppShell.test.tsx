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

