import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { InstallBanner } from "@/components/profile/InstallBanner";
import { PlayerProfileSection } from "@/features/chips/components/PlayerProfileSection";
import { PasswordSheet } from "@/components/profile/PasswordSheet";
import { NicknameSheet } from "@/components/profile/ProfileEditSheets";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ScheduleViewSheet } from "@/components/profile/ScheduleViewSheet";
import { SCHEDULE_VIEW_LABELS } from "@/features/tournaments/lib/scheduleView";
import { SettingsList } from "@/components/profile/SettingsList";
import { ThemeSheet } from "@/components/profile/ThemeSheet";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useTheme } from "@/hooks/useTheme";
import { THEME_LABELS } from "@/lib/theme";
import {
  isStaffUser,
  useChangePassword,
  useLogout,
  useMe,
  useSetPassword,
  useUpdateProfile,
} from "@/features/auth/hooks";
import { usePushSubscription, useSubscribePush, useUnsubscribePush } from "@/features/push/hooks";
import { pushErrorMessage } from "@/features/push/lib/pushErrorMessage";
import packageJson from "../../../package.json";

/** Ссылка на поддержку в Telegram; без переменной окружения пункт не показывается. */
const SUPPORT_URL = import.meta.env.VITE_TELEGRAM_SUPPORT_URL || null;

export function ProfilePage() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { data: user } = useMe();
  const updateProfile = useUpdateProfile();
  const setPassword = useSetPassword();
  const changePassword = useChangePassword();
  const logout = useLogout();
  const pushSubscription = usePushSubscription();
  const subscribePush = useSubscribePush();
  const unsubscribePush = useUnsubscribePush();
  const theme = useTheme();
  const [nicknameOpen, setNicknameOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [scheduleViewOpen, setScheduleViewOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  if (!user) {
    return null;
  }

  const pushPending = subscribePush.isPending || unsubscribePush.isPending;

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 4000);
  };

  return (
    <div className="bg-bg min-h-full pb-5" data-testid="profile-page">
      <ProfileHeader
        user={user}
        onEdit={() => {
          updateProfile.reset();
          setNicknameOpen(true);
        }}
      />
      <InstallBanner />
      <PlayerProfileSection />
      <SettingsList
        staffEntry={
          isStaffUser(user)
            ? {
                subtitle: user.role === "admin" ? "Вы администратор" : "Вы редактор",
              }
            : null
        }
        themeLabel={THEME_LABELS[theme.choice]}
        scheduleViewLabel={SCHEDULE_VIEW_LABELS[user.schedule_view]}
        pushEnabled={Boolean(pushSubscription.data)}
        pushPending={pushPending}
        hasPassword={user.has_password}
        supportUrl={SUPPORT_URL}
        onTheme={() => setThemeOpen(true)}
        onScheduleView={() => setScheduleViewOpen(true)}
        onPassword={() => {
          setPassword.reset();
          changePassword.reset();
          setPasswordOpen(true);
        }}
        onPushChange={(enabled) => {
          if (enabled) {
            void subscribePush.mutateAsync().catch((error: unknown) => {
              showToast(pushErrorMessage(error));
            });
            return;
          }
          void unsubscribePush
            .mutateAsync()
            .catch(() => showToast("Не удалось отключить push-уведомления"));
        }}
      />

      <Link
        to="/dialogs/new?topic=data_change"
        className="border-line-strong bg-surface text-ink mx-4 mt-6 flex h-12 w-[calc(100%-32px)] items-center justify-center rounded-md border text-[15px] font-bold"
      >
        Хочу изменить данные
      </Link>
      <button
        type="button"
        className="border-danger/35 text-danger mx-4 mt-3 flex h-12 w-[calc(100%-32px)] items-center justify-center rounded-md border text-[15px] font-bold"
        disabled={logout.isPending}
        onClick={() => {
          void (async () => {
            const ok = await confirm({
              title: "Выйти из аккаунта?",
              description: "Данные аккаунта сохранятся — войти снова можно по email.",
              confirmLabel: "Выйти",
              cancelLabel: "Отмена",
              variant: "danger",
            });
            if (!ok) return;
            await logout.mutateAsync();
            navigate("/", { replace: true });
          })();
        }}
      >
        Выйти
      </button>
      <p className="num text-ink-3 mt-4 text-center text-[12px]">
        Ginger · версия {packageJson.version}
      </p>

      <NicknameSheet
        open={nicknameOpen}
        onOpenChange={setNicknameOpen}
        nickname={user.nickname}
        isPending={updateProfile.isPending}
        error={updateProfile.error}
        onSave={(nickname) => updateProfile.mutateAsync({ nickname }).then(() => undefined)}
      />
      <ThemeSheet
        open={themeOpen}
        onOpenChange={setThemeOpen}
        choice={theme.choice}
        onSelect={(next) => {
          theme.setTheme(next);
          setThemeOpen(false);
        }}
      />
      <ScheduleViewSheet
        open={scheduleViewOpen}
        onOpenChange={setScheduleViewOpen}
        choice={user.schedule_view}
        isPending={updateProfile.isPending}
        onSelect={(schedule_view) => {
          void updateProfile
            .mutateAsync({ schedule_view })
            .then(() => setScheduleViewOpen(false))
            .catch(() => showToast("Не удалось сохранить вид расписания"));
        }}
      />
      <PasswordSheet
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
        hasPassword={user.has_password}
        isPending={setPassword.isPending || changePassword.isPending}
        error={setPassword.error ?? changePassword.error}
        onSetPassword={(password) => setPassword.mutateAsync({ password }).then(() => undefined)}
        onChangePassword={(current_password, new_password) =>
          changePassword.mutateAsync({ current_password, new_password }).then(() => undefined)
        }
      />

      {toast ? (
        <div
          role="status"
          className="border-line-strong bg-surface-2 text-ink shadow-elevated fixed bottom-24 left-1/2 z-[60] w-[calc(100%-32px)] max-w-[388px] -translate-x-1/2 rounded-md border px-4 py-3 text-center text-[13px] font-semibold"
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}
