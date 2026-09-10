import { describe, expect, it } from "vitest";

import {
  buildLoginLocation,
  guestSafePath,
  resolveReturnTo,
  safeInternalNextPath,
} from "@/features/auth/lib/redirect";

describe("safeInternalNextPath", () => {
  it("returns fallback for empty values", () => {
    expect(safeInternalNextPath(null)).toBe("/");
    expect(safeInternalNextPath(undefined)).toBe("/");
    expect(safeInternalNextPath("")).toBe("/");
    expect(safeInternalNextPath("   ")).toBe("/");
  });

  it("accepts safe internal paths", () => {
    expect(safeInternalNextPath("/profile")).toBe("/profile");
    expect(safeInternalNextPath("/events/abc")).toBe("/events/abc");
    expect(safeInternalNextPath("  /admin/series  ")).toBe("/admin/series");
  });

  it("rejects protocol-relative and external urls", () => {
    expect(safeInternalNextPath("//evil.com")).toBe("/");
    expect(safeInternalNextPath("http://evil.com")).toBe("/");
    expect(safeInternalNextPath("https://evil.com")).toBe("/");
    expect(safeInternalNextPath("javascript:alert(1)")).toBe("/");
  });

  it("uses custom fallback", () => {
    expect(safeInternalNextPath(null, "/admin")).toBe("/admin");
    expect(safeInternalNextPath("//bad", "/calendar")).toBe("/calendar");
  });
});

describe("resolveReturnTo / buildLoginLocation", () => {
  it("prefers state.returnTo over next query", () => {
    expect(resolveReturnTo({ returnTo: "/events/1" }, "/profile")).toBe("/events/1");
    expect(resolveReturnTo(null, "/profile")).toBe("/profile");
    expect(resolveReturnTo(null, "//evil")).toBe("/");
  });

  it("builds login location with safe state", () => {
    expect(buildLoginLocation("/bookmarks")).toEqual({
      pathname: "/login",
      state: { returnTo: "/bookmarks" },
    });
  });
});

describe("guestSafePath", () => {
  it("keeps paths a guest can open", () => {
    expect(guestSafePath("/")).toBe("/");
    expect(guestSafePath("/bookmarks")).toBe("/bookmarks");
    expect(guestSafePath("/calendar")).toBe("/calendar");
    expect(guestSafePath("/events/abc")).toBe("/events/abc");
    expect(guestSafePath("/bookmarks?tab=history")).toBe("/bookmarks?tab=history");
  });

  it("collapses auth-only paths so the guest is not bounced back to login", () => {
    expect(guestSafePath("/profile")).toBe("/");
    expect(guestSafePath("/profile?x=1")).toBe("/");
    expect(guestSafePath("/admin")).toBe("/");
    expect(guestSafePath("/admin/series")).toBe("/");
  });


  it("does not confuse prefixes with auth-only routes", () => {
    expect(guestSafePath("/profiles")).toBe("/profiles");
    expect(guestSafePath("/administration")).toBe("/administration");
  });

  it("still rejects external targets", () => {
    expect(guestSafePath("//evil.com")).toBe("/");
    expect(guestSafePath("https://evil.com")).toBe("/");
  });
});
