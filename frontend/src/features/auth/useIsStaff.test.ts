import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { useIsStaff } from "@/features/auth/useIsStaff";

vi.mock("@/features/auth/hooks", () => ({
  isStaffUser: (user: { role?: string } | undefined) =>
    user?.role === "admin" || user?.role === "editor",
  useMe: vi.fn(),
}));

import { useMe } from "@/features/auth/hooks";

const useMeMock = vi.mocked(useMe);

describe("useIsStaff", () => {
  it("returns false while me is pending", () => {
    useMeMock.mockReturnValue({
      data: undefined,
      isPending: true,
    } as ReturnType<typeof useMe>);
    const { result } = renderHook(() => useIsStaff());
    expect(result.current).toBe(false);
  });

  it("returns false for regular user", () => {
    useMeMock.mockReturnValue({
      data: { role: "user" },
      isPending: false,
    } as ReturnType<typeof useMe>);
    const { result } = renderHook(() => useIsStaff());
    expect(result.current).toBe(false);
  });

  it("returns true for editor and admin", () => {
    useMeMock.mockReturnValue({
      data: { role: "editor" },
      isPending: false,
    } as ReturnType<typeof useMe>);
    expect(renderHook(() => useIsStaff()).result.current).toBe(true);

    useMeMock.mockReturnValue({
      data: { role: "admin" },
      isPending: false,
    } as ReturnType<typeof useMe>);
    expect(renderHook(() => useIsStaff()).result.current).toBe(true);
  });
});
