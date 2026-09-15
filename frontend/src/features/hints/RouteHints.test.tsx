import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { findRouteHint } from "@/features/hints/hints";
import { RouteHints } from "@/features/hints/RouteHints";
import { renderWithProviders } from "@/test/render";

const auth = vi.hoisted(() => ({ user: { id: "u1" } as unknown }));
vi.mock("@/features/auth/hooks", () => ({
  useMe: () => ({ data: auth.user }),
}));

describe("RouteHints", () => {
  beforeEach(() => {
    window.localStorage.clear();
    auth.user = { id: "u1" };
  });

  it("находит памятку по адресу экрана", () => {
    expect(findRouteHint("/chips")?.id).toBe("chips");
    expect(findRouteHint("/chips/accounts")?.id).toBe("accounts");
    expect(findRouteHint("/chips/3f2b7c1e-1d2a-4c5b-9e8f-0a1b2c3d4e5f")?.id).toBe("request");
    expect(findRouteHint("/profile")).toBeNull();
  });

  it("показывается один раз и не показывается гостю", async () => {
    const first = renderWithProviders(<RouteHints enabled />, { route: "/chips" });
    expect(await screen.findByTestId("route-hint")).toBeInTheDocument();
    expect(screen.getByText(/20 минут на оплату/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Понятно" }));
    await waitFor(() => expect(screen.queryByTestId("route-hint")).toBeNull());
    expect(window.localStorage.getItem("ginger.hints.seen")).toContain("chips");
    first.unmount();

    renderWithProviders(<RouteHints enabled />, { route: "/chips" });
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(screen.queryByTestId("route-hint")).toBeNull();

    auth.user = undefined;
    window.localStorage.clear();
    renderWithProviders(<RouteHints enabled />, { route: "/tournaments" });
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(screen.queryByTestId("route-hint")).toBeNull();
  });
});
