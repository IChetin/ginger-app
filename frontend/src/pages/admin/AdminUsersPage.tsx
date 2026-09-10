import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import type { AdminUser } from "@/api/types/admin";
import type { UserRole } from "@/api/types/auth";
import { ApiError } from "@/api/client";
import { AdminTable } from "@/components/admin/AdminTable";
import { Modal } from "@/components/admin/Modal";
import { Pagination } from "@/components/admin/Pagination";
import { RoleBadge, roleLabel } from "@/components/admin/RoleBadge";
import { SearchInput } from "@/components/admin/SearchInput";
import { Toolbar, ToolbarHint, ToolbarSpacer } from "@/components/admin/Toolbar";
import { useMe, useUpdateUserRole, useUsersAdmin } from "@/features/admin/hooks";
import { cn } from "@/lib/utils";

const ROLE_OPTIONS: UserRole[] = ["user", "editor", "admin"];

const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  user: "Обычный доступ: расписание, закладки",
  editor: "+ админка: серии, турниры, импорт расписаний, справочники",
  admin: "+ управление пользователями и ролями",
};

const LIMIT_OPTIONS = [20, 50, 100] as const;

function parseLimit(raw: string | null): number {
  const value = Number(raw);
  if (LIMIT_OPTIONS.includes(value as (typeof LIMIT_OPTIONS)[number])) {
    return value;
  }
  return 20;
}

function parseOffset(raw: string | null): number {
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function parseRole(raw: string | null): UserRole | "all" {
  if (raw === "user" || raw === "editor" || raw === "admin") {
    return raw;
  }
  return "all";
}

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatRange(offset: number, limit: number, total: number): string {
  if (total === 0) {
    return "Показано 0 из 0";
  }
  const from = offset + 1;
  const to = Math.min(offset + limit, total);
  return `Показано ${from.toLocaleString("ru-RU")}–${to.toLocaleString("ru-RU")} из ${total.toLocaleString("ru-RU")}`;
}

function userInitials(user: AdminUser): string {
  const source = user.nickname.trim() || user.email.trim();
  const parts = source.split(/[\s._@-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase() || "??";
}

function roleChangeTitle(role: UserRole): string {
  if (role === "admin") {
    return "Назначить администратором";
  }
  if (role === "editor") {
    return "Назначить редактором";
  }
  return "Назначить пользователем";
}

function lockReason(user: AdminUser, meId: string | undefined): string | null {
  if (meId !== undefined && user.id === meId) {
    return "Нельзя менять свою роль";
  }
  if (user.is_superadmin) {
    return "Нельзя менять роль env-superadmin";
  }
  return null;
}

export function AdminUsersPage() {
  const { data: me } = useMe();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchFromUrl = searchParams.get("search") ?? "";
  const roleFilter = parseRole(searchParams.get("role"));
  const limit = parseLimit(searchParams.get("limit"));
  const offset = parseOffset(searchParams.get("offset"));

  const [searchInput, setSearchInput] = useState(searchFromUrl);
  const [modalUser, setModalUser] = useState<AdminUser | null>(null);
  const [selectedRole, setSelectedRole] = useState<UserRole>("user");
  const [toast, setToast] = useState<string | null>(null);

  const updateRole = useUpdateUserRole();

  useEffect(() => {
    setSearchInput(searchFromUrl);
  }, [searchFromUrl]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = searchInput.slice(0, 128);
      const current = searchParams.get("search") ?? "";
      if (next === current) {
        return;
      }
      const params = new URLSearchParams(searchParams);
      if (next) {
        params.set("search", next);
      } else {
        params.delete("search");
      }
      params.set("offset", "0");
      setSearchParams(params, { replace: true });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput, searchParams, setSearchParams]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const usersQuery = useUsersAdmin({
    limit,
    offset,
    search: searchFromUrl || undefined,
    role: roleFilter === "all" ? undefined : roleFilter,
  });

  const items = usersQuery.data?.items ?? [];
  const total = usersQuery.data?.total ?? 0;

  function patchParams(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    setSearchParams(params, { replace: true });
  }

  function openRoleModal(user: AdminUser) {
    setModalUser(user);
    setSelectedRole(user.role);
  }

  function closeModal() {
    setModalUser(null);
  }

  async function confirmRoleChange() {
    if (!modalUser || selectedRole === modalUser.role) {
      closeModal();
      return;
    }
    try {
      await updateRole.mutateAsync({
        id: modalUser.id,
        body: { role: selectedRole },
      });
      setToast(`Роль изменена: ${roleLabel(selectedRole)}`);
      closeModal();
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 404) {
          setToast("Пользователь не найден");
        } else if (error.status === 403) {
          setToast(error.message);
        } else {
          setToast(error.message);
        }
      } else {
        setToast("Не удалось сменить роль");
      }
    }
  }

  return (
    <>
      <header className="border-line bg-bg sticky top-0 z-10 flex items-center gap-3.5 border-b px-6 py-[18px]">
        <div>
          <div className="text-xl font-extrabold">Пользователи</div>
          <div className="num text-ink-3 text-xs">{total.toLocaleString("ru-RU")} всего</div>
        </div>
      </header>

      <div className="flex-1 px-6 pt-5 pb-10">
        <Toolbar>
          <SearchInput
            value={searchInput}
            onChange={(value) => setSearchInput(value.slice(0, 128))}
            placeholder="Поиск по email или никнейму"
            maxLength={128}
          />
          <select
            value={roleFilter}
            onChange={(event) => {
              const value = event.target.value;
              patchParams({
                role: value === "all" ? null : value,
                offset: "0",
              });
            }}
            className="border-line-strong bg-surface text-ink-2 h-9 cursor-pointer rounded-[10px] border px-2.5 text-[13px] font-semibold"
            aria-label="Фильтр по роли"
          >
            <option value="all">Все роли</option>
            <option value="admin">Администраторы</option>
            <option value="editor">Редакторы</option>
            <option value="user">Пользователи</option>
          </select>
          <ToolbarSpacer />
          <ToolbarHint>{formatRange(offset, limit, total)}</ToolbarHint>
        </Toolbar>

        {usersQuery.isError ? (
          <div className="border-danger-soft bg-danger-soft text-danger rounded-[14px] border px-4 py-3 text-sm">
            {usersQuery.error instanceof ApiError && usersQuery.error.status === 403
              ? usersQuery.error.message
              : "Не удалось загрузить пользователей"}
          </div>
        ) : (
          <>
            <AdminTable
              rows={items}
              rowKey={(row) => row.id}
              loading={usersQuery.isLoading}
              empty="Пользователи не найдены"
              columns={[
                {
                  key: "user",
                  header: "Пользователь",
                  headerClassName: "w-[40%]",
                  cell: (user) => {
                    const isMe = me?.id === user.id;
                    return (
                      <div className="flex items-center gap-2.5">
                        <div
                          className={cn(
                            "flex size-[34px] shrink-0 items-center justify-center rounded-[10px] text-xs font-extrabold",
                            isMe
                              ? "bg-gold-grad text-ink-ongold border-transparent"
                              : "border-line-strong bg-surface-3 text-ink-2 border",
                          )}
                        >
                          {userInitials(user)}
                        </div>
                        <div>
                          <div className="text-sm font-bold">
                            {user.nickname}
                            {isMe ? (
                              <span className="bg-gold-soft text-gold ml-1.5 rounded-[5px] px-1.5 py-0.5 text-[10px] font-extrabold tracking-[0.04em]">
                                ВЫ
                              </span>
                            ) : null}
                            {user.is_superadmin ? (
                              <span className="bg-surface-3 text-ink-3 ml-1.5 rounded-[5px] px-1.5 py-0.5 text-[10px] font-extrabold tracking-[0.04em]">
                                ENV
                              </span>
                            ) : null}
                          </div>
                          <div className="text-ink-3 text-xs">{user.email}</div>
                        </div>
                      </div>
                    );
                  },
                },
                {
                  key: "role",
                  header: "Роль",
                  cell: (user) => <RoleBadge role={user.role} />,
                },
                {
                  key: "created",
                  header: "Регистрация",
                  cell: (user) => (
                    <span className="num text-sm">{formatCreatedAt(user.created_at)}</span>
                  ),
                },
                {
                  key: "actions",
                  header: "",
                  headerClassName: "text-right",
                  className: "text-right",
                  cell: (user) => {
                    const reason = lockReason(user, me?.id);
                    return (
                      <button
                        type="button"
                        disabled={reason !== null || updateRole.isPending}
                        title={reason ?? undefined}
                        onClick={() => openRoleModal(user)}
                        className={cn(
                          "border-line-strong inline-flex h-[31px] items-center justify-center rounded-[8px] border",
                          "text-ink-2 bg-transparent px-[11px] text-[13px] font-bold",
                          "hover:enabled:bg-surface-2 hover:enabled:text-ink",
                          "disabled:cursor-not-allowed disabled:opacity-45",
                          "active:enabled:translate-y-px",
                        )}
                      >
                        Изменить роль
                      </button>
                    );
                  },
                },
              ]}
            />

            <Pagination
              offset={offset}
              limit={limit}
              total={total}
              onOffsetChange={(next) => patchParams({ offset: String(next) })}
              onLimitChange={(next) => patchParams({ limit: String(next), offset: "0" })}
            />
          </>
        )}
      </div>

      <Modal
        open={modalUser !== null}
        onClose={closeModal}
        title="Изменить роль"
        subtitle={modalUser ? `${modalUser.nickname} · ${modalUser.email}` : undefined}
        footer={
          <>
            <button
              type="button"
              onClick={closeModal}
              className="border-line-strong text-ink-2 hover:bg-surface-2 hover:text-ink inline-flex h-[38px] items-center justify-center rounded-[10px] border bg-transparent px-4 text-sm font-bold"
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={updateRole.isPending || !modalUser || selectedRole === modalUser.role}
              onClick={() => void confirmRoleChange()}
              className="bg-gold-grad text-ink-ongold inline-flex h-[38px] items-center justify-center rounded-[10px] px-4 text-sm font-extrabold active:enabled:translate-y-px disabled:cursor-not-allowed disabled:opacity-45"
            >
              {roleChangeTitle(selectedRole)}
            </button>
          </>
        }
      >
        {ROLE_OPTIONS.map((role) => {
          const checked = selectedRole === role;
          return (
            <label
              key={role}
              className={cn(
                "mb-2 flex cursor-pointer items-start gap-[11px] rounded-[10px] border px-3 py-3",
                checked ? "border-gold bg-gold-soft" : "border-line-strong bg-surface-2",
              )}
            >
              <input
                type="radio"
                name="admin-user-role"
                className="mt-0.5 accent-[var(--gold)]"
                checked={checked}
                onChange={() => setSelectedRole(role)}
              />
              <div>
                <div className="text-sm font-bold">{roleLabel(role)}</div>
                <div className="text-ink-2 mt-0.5 text-xs">{ROLE_DESCRIPTIONS[role]}</div>
              </div>
            </label>
          );
        })}

        {(selectedRole === "editor" || selectedRole === "admin") && (
          <div className="border-warn/30 bg-warn-soft mt-3 flex gap-[9px] rounded-[10px] border p-[11px] text-[12.5px]">
            <svg
              className="text-warn size-[18px] shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 8v5M12 17h.01" />
              <circle cx="12" cy="12" r="9" />
            </svg>
            <div>
              Роль «{roleLabel(selectedRole)}» даёт право публиковать и менять расписания —
              изменения уходят push-уведомлениями подписчикам.
            </div>
          </div>
        )}
      </Modal>

      {toast ? (
        <div
          role="status"
          className="border-line-strong bg-surface shadow-elevated fixed right-4 bottom-4 z-[60] max-w-sm rounded-[10px] border px-4 py-3 text-sm font-semibold"
          data-testid="admin-toast"
        >
          {toast}
        </div>
      ) : null}
    </>
  );
}
