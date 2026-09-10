import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminUser } from "@/api/types/admin";
import type { UserMe } from "@/api/types/auth";
import { AdminUsersPage } from "@/pages/admin/AdminUsersPage";
import { renderWithProviders } from "@/test/render";

const fetchCurrentUser = vi.hoisted(() => vi.fn());
const fetchAdminUsers = vi.hoisted(() => vi.fn());
const updateAdminUserRole = vi.hoisted(() => vi.fn());

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    fetchCurrentUser: (...args: unknown[]) => fetchCurrentUser(...args),
  };
});

vi.mock("@/features/admin/api", async () => {
  const actual =
    await vi.importActual<typeof import("@/features/admin/api")>("@/features/admin/api");
  return {
    ...actual,
    fetchAdminUsers: (...args: unknown[]) => fetchAdminUsers(...args),
    updateAdminUserRole: (...args: unknown[]) => updateAdminUserRole(...args),
  };
});

const adminMe: UserMe = {
  id: "admin-1",
  email: "admin@example.com",
  phone: null,
  nickname: "admin",
  base_currency: "RUB",
  timezone: null,
  role: "admin",
  default_reminder_offsets: [1440, 120],
  email_verified: true,
  has_password: false,
  created_at: "2026-01-01T00:00:00Z",
};

const usersFixture: AdminUser[] = [
  {
    id: "admin-1",
    email: "admin@example.com",
    nickname: "admin",
    role: "admin",
    is_superadmin: true,
    email_verified: true,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "user-2",
    email: "player@example.com",
    nickname: "player",
    role: "user",
    is_superadmin: false,
    email_verified: true,
    created_at: "2026-02-01T00:00:00Z",
  },
];

describe("AdminUsersPage", () => {
  beforeEach(() => {
    fetchCurrentUser.mockReset();
    fetchAdminUsers.mockReset();
    updateAdminUserRole.mockReset();
    fetchCurrentUser.mockResolvedValue(adminMe);
    fetchAdminUsers.mockResolvedValue({
      items: usersFixture,
      total: 2,
      limit: 20,
      offset: 0,
    });
    updateAdminUserRole.mockImplementation(async (id: string, body: { role: string }) => ({
      ...usersFixture.find((item) => item.id === id)!,
      role: body.role,
    }));
  });

  it("renders users and locks self / env superadmin", async () => {
    renderWithProviders(<AdminUsersPage />, { route: "/admin/users" });

    expect(await screen.findByText("player@example.com")).toBeInTheDocument();
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
    expect(screen.getByText("ВЫ")).toBeInTheDocument();
    expect(screen.getByText("ENV")).toBeInTheDocument();

    const rows = screen.getAllByRole("row");
    const adminRow = rows.find((row) => within(row).queryByText("admin@example.com"));
    expect(adminRow).toBeTruthy();
    const lockedBtn = within(adminRow!).getByRole("button", { name: "Изменить роль" });
    expect(lockedBtn).toBeDisabled();
    expect(lockedBtn).toHaveAttribute("title", "Нельзя менять свою роль");
  });

  it("confirms role change for editable user", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminUsersPage />, { route: "/admin/users" });

    expect(await screen.findByText("player@example.com")).toBeInTheDocument();
    const rows = screen.getAllByRole("row");
    const playerRow = rows.find((row) => within(row).queryByText("player@example.com"));
    expect(playerRow).toBeTruthy();

    await user.click(within(playerRow!).getByRole("button", { name: "Изменить роль" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Редактор/i }));
    await user.click(screen.getByRole("button", { name: "Назначить редактором" }));

    await waitFor(() => {
      expect(updateAdminUserRole).toHaveBeenCalledWith("user-2", { role: "editor" });
    });
    expect(await screen.findByTestId("admin-toast")).toHaveTextContent(/Роль изменена/);
  });

  it("keeps search and role filter in URL", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminUsersPage />, { route: "/admin/users?role=editor&limit=50" });

    expect(fetchAdminUsers).toHaveBeenCalledWith(
      expect.objectContaining({ role: "editor", limit: 50, offset: 0 }),
    );

    const search = await screen.findByPlaceholderText("Поиск по email или никнейму");
    await user.type(search, "ivan");

    await waitFor(() => {
      expect(fetchAdminUsers).toHaveBeenCalledWith(
        expect.objectContaining({ search: "ivan", role: "editor" }),
      );
    });
  });
});
