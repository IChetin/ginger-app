import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";
import { AppRoutes } from "@/App";
import { renderWithProviders } from "@/test/render";

const fetchCurrentUser = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    fetchCurrentUser: (...args: unknown[]) => fetchCurrentUser(...args),
  };
});

describe("App routes", () => {
  beforeEach(() => {
    fetchCurrentUser.mockRejectedValue(new ApiError(401, "unauthorized", "Unauthorized"));
  });

  it("shows a guest the app home instead of the login form", async () => {
    renderWithProviders(<AppRoutes />, { route: "/" });
    expect(await screen.findByTestId("home-guest")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Вход" })).not.toBeInTheDocument();
  });

  it("keeps a guest in the app on a personal page and offers to log in", async () => {
    renderWithProviders(<AppRoutes />, { route: "/profile" });
    expect(await screen.findByTestId("guest-gate")).toBeInTheDocument();
    expect(screen.getByText("Войдите, чтобы продолжить")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Войти" })).toHaveAttribute("href", "/login");
  });
});
