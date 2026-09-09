import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";
import { listDemoHands } from "@/demo/hands";
import { HandsListPage } from "@/features/hands/pages/HandsListPage";
import { renderWithProviders } from "@/test/render";

const fetchCurrentUser = vi.hoisted(() => vi.fn());
const fetchHands = vi.hoisted(() => vi.fn());
const fetchHandEvents = vi.hoisted(() => vi.fn());
const updateHand = vi.hoisted(() => vi.fn());
const deleteHand = vi.hoisted(() => vi.fn());

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    fetchCurrentUser: (...args: unknown[]) => fetchCurrentUser(...args),
  };
});

vi.mock("@/features/hands/api", async () => {
  const actual =
    await vi.importActual<typeof import("@/features/hands/api")>("@/features/hands/api");
  return {
    ...actual,
    fetchHands: (...args: unknown[]) => fetchHands(...args),
    fetchHandEvents: (...args: unknown[]) => fetchHandEvents(...args),
    updateHand: (...args: unknown[]) => updateHand(...args),
    deleteHand: (...args: unknown[]) => deleteHand(...args),
  };
});

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{JSON.stringify(location)}</output>;
}

describe("guest demo hands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchCurrentUser.mockRejectedValue(new ApiError(401, "unauthorized", "Unauthorized"));
    fetchHands.mockResolvedValue({ items: [], total: 0 });
    fetchHandEvents.mockResolvedValue([]);
  });

  it("shows three demo hands without calling the API", async () => {
    renderWithProviders(<HandsListPage />, { route: "/hands" });
    const page = await screen.findByTestId("hands-list");
    expect(page).toHaveAttribute("data-demo", "true");
    expect(await screen.findByTestId("demo-banner")).toHaveTextContent("Пример данных");
    expect(screen.getByTestId("auth-gate")).toHaveTextContent("Ваши раздачи и разборы");
    for (const item of listDemoHands().items) {
      expect(await screen.findByTestId(`hand-card-${item.slug}`)).toBeInTheDocument();
    }
    expect(screen.getByText("Правильно ли было пушить тёрн с 15 аутами?")).toBeInTheDocument();
    expect(fetchHands).not.toHaveBeenCalled();
    expect(fetchHandEvents).not.toHaveBeenCalled();
  });

  it("opens a demo hand in the replayer", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/hands" element={<HandsListPage />} />
        <Route path="/hand/:slug" element={<LocationProbe />} />
      </Routes>,
      { route: "/hands" },
    );
    await screen.findByTestId("hand-card-demo-1");
    await user.click(screen.getByTestId("hand-card-demo-1").querySelector("button")!);
    expect(screen.getByTestId("location")).toHaveTextContent('"/hand/demo-1"');
  });

  it("sends the plus button to login with returnTo /hand/new", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <HandsListPage />
        <LocationProbe />
      </>,
      { route: "/hands" },
    );
    await screen.findByTestId("hand-card-demo-1");
    await user.click(screen.getByRole("button", { name: "Новая раздача" }));
    expect(screen.getByTestId("location")).toHaveTextContent('"/login"');
    expect(screen.getByTestId("location")).toHaveTextContent('"returnTo":"/hand/new"');
  });

  it("blocks edit and delete with a login sheet", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HandsListPage />, { route: "/hands" });
    await screen.findByTestId("hand-card-demo-1");
    await user.click(screen.getAllByTestId("hand-card-menu-btn")[0]!);
    await user.click(screen.getByRole("menuitem", { name: "Править" }));
    expect(await screen.findByTestId("demo-login-sheet")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Войдите, чтобы сохранять раздачи" }),
    ).toBeInTheDocument();
    expect(updateHand).not.toHaveBeenCalled();
    expect(deleteHand).not.toHaveBeenCalled();
  });
});
