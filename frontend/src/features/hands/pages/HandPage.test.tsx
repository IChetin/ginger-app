import { screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";
import type { HandRead } from "@/api/types/hands";
import { HandDraftRedirect, HandPage } from "@/features/hands/pages/HandPage";
import { renderWithProviders } from "@/test/render";

const fetchHand = vi.hoisted(() => vi.fn());

vi.mock("@/features/hands/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/hands/api")>();
  return {
    ...actual,
    fetchHand: (...args: unknown[]) => fetchHand(...args),
  };
});

vi.mock("@/features/hands/pages/HandInputPage", () => ({
  HandInputPage: () => <div data-testid="hand-input-page" />,
}));

vi.mock("@/features/hands/pages/HandReplayPage", () => ({
  HandReplayPage: () => <div data-testid="hand-replay-page" />,
}));

const DRAFT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const DRAFT_SLUG = "dR4ftSlugA";

function draftRead(): HandRead {
  return {
    id: DRAFT_ID,
    slug: DRAFT_SLUG,
    status: "draft",
    current_step: 2,
    current_street: null,
    title: null,
    note: null,
    is_public: false,
    views_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    event_id: null,
    series_id: null,
    live_session_id: null,
    event: null,
    series: null,
    author: { nickname: "player" },
    is_owner: true,
    data: null,
    wizard: { step: 2 },
  };
}

function publishedRead(): HandRead {
  return {
    ...draftRead(),
    slug: "pubSlug234",
    status: "published",
    current_step: null,
    is_public: true,
    data: {
      schema_version: 1,
      table_size: 6,
      blinds: { sb: 100, bb: 200, ante: 0 },
      hero_seat: 1,
      button_seat: 1,
      seats: [],
      streets: [],
      result: {
        winner_seats: [1],
        pot: 0,
        hero_invested: 0,
        hero_profit: 0,
        side_pots: null,
      },
    },
    wizard: null,
  };
}

describe("HandPage", () => {
  beforeEach(() => {
    fetchHand.mockReset();
  });

  it("opens a draft in the input page", async () => {
    fetchHand.mockResolvedValue(draftRead());
    renderWithProviders(
      <Routes>
        <Route path="/hand/:slug" element={<HandPage />} />
      </Routes>,
      { route: `/hand/${DRAFT_SLUG}` },
    );
    expect(await screen.findByTestId("hand-input-page")).toBeInTheDocument();
    expect(screen.queryByTestId("hand-replay-page")).not.toBeInTheDocument();
  });

  it("opens a published hand in the replay page", async () => {
    fetchHand.mockResolvedValue(publishedRead());
    renderWithProviders(
      <Routes>
        <Route path="/hand/:slug" element={<HandPage />} />
      </Routes>,
      { route: "/hand/pubSlug234" },
    );
    expect(await screen.findByTestId("hand-replay-page")).toBeInTheDocument();
    expect(screen.queryByTestId("hand-input-page")).not.toBeInTheDocument();
  });

  it("opens a new draft on the final slug without waiting for the server", async () => {
    fetchHand.mockRejectedValue(new ApiError(404, "not_found", "Раздача не найдена"));
    renderWithProviders(
      <Routes>
        <Route path="/hand/:slug" element={<HandPage />} />
      </Routes>,
      {
        routerProps: {
          initialEntries: [
            {
              pathname: `/hand/${DRAFT_SLUG}`,
              state: { creating: true, draftId: DRAFT_ID, slug: DRAFT_SLUG },
            },
          ],
        },
      },
    );
    expect(await screen.findByTestId("hand-input-page")).toBeInTheDocument();
    expect(screen.queryByText("Раздача не найдена")).not.toBeInTheDocument();
    expect(fetchHand).not.toHaveBeenCalled();
  });

  it("shows not found for a missing hand", async () => {
    fetchHand.mockRejectedValue(new ApiError(404, "not_found", "Раздача не найдена"));
    renderWithProviders(
      <Routes>
        <Route path="/hand/:slug" element={<HandPage />} />
      </Routes>,
      { route: "/hand/missing123" },
    );
    expect(await screen.findByText("Раздача не найдена")).toBeInTheDocument();
  });

  it("redirects an owner from the legacy draft URL to the slug", async () => {
    fetchHand.mockImplementation(async (ref: unknown) => {
      if (ref === DRAFT_ID || ref === DRAFT_SLUG) return draftRead();
      throw new ApiError(404, "not_found", "Раздача не найдена");
    });
    renderWithProviders(
      <Routes>
        <Route path="/hand/draft/:draftId" element={<HandDraftRedirect />} />
        <Route path="/hand/:slug" element={<HandPage />} />
      </Routes>,
      { route: `/hand/draft/${DRAFT_ID}` },
    );
    expect(await screen.findByTestId("hand-input-page")).toBeInTheDocument();
    await waitFor(() => expect(fetchHand).toHaveBeenCalledWith(DRAFT_SLUG));
  });
});
