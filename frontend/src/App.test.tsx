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

  it("sends a guest from home to login", async () => {
    renderWithProviders(<AppRoutes />, { route: "/" });
    expect(await screen.findByRole("heading", { name: "Вход" })).toBeInTheDocument();
  });

  it("redirects a profile guest to login", async () => {
    renderWithProviders(<AppRoutes />, { route: "/profile" });
    expect(await screen.findByRole("heading", { name: "Вход" })).toBeInTheDocument();
  });
});
