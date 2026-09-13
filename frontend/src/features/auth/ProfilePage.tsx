import { useState } from "react";
import { useNavigate } from "react-router-dom";

import type { BaseCurrencyCode } from "@/api/types/auth";
import { IntervalSheet } from "@/components/bookmarks/IntervalSheet";
import { InstallBanner } from "@/components/profile/InstallBanner";
import { PasswordSheet } from "@/components/profile/PasswordSheet";
import {
  CurrencySheet,
  NicknameSheet,
  TimezoneSheet,
} from "@/components/profile/ProfileEditSheets";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ScheduleViewSheet } from "@/components/profile/ScheduleViewSheet";
import { SCHEDULE_VIEW_LABELS } from "@/features/tournaments/lib/scheduleView";
import { SettingsList } from "@/components/profile/SettingsList";
import { ThemeSheet } from "@/components/profile/ThemeSheet";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useTheme } from "@/hooks/useTheme";
import { THEME_LABELS } from "@/lib/theme";
import { getBrowserTimezone } from "@/lib/time";
import { formatReminderOffsetsPhrase } from "@/features/bookmarks/lib/reminderPresets";
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
import { useCurrencies } from "@/features/auth/hooks";
import packageJson from "../../../package.json";

const SUPPORT_URL = import.meta.env.VITE_TELEGRAM_SUPPORT_URL || "https://t.me/day2_support";

export function ProfilePage() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { data: user } = useMe();
  const currencies = useCurrencies();
  const updateProfile = useUpdateProfile();
  const setPassword = useSetPassword();
  const changePassword = useChangePassword();
  const logout = useLogout();
  const pushSubscription = usePushSubscription();
  const subscribePush = useSubscribePush();
  const unsubscribePush = useUnsubscribePush();
  const theme = useTheme();
  const [nicknameOpen, setNicknameOpen] = useState(false);
  const [offsetsOpen, setOffsetsOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [timezoneOpen, setTimezoneOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [scheduleViewOpen, setScheduleViewOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  if (!user) {
    return null;
  }

  const currency = currencies.data?.find((item) => item.code === user.base_currency);
  const pushPending = subscribePush.isPending || unsubscribePush.isPending;
  const timezoneLabel = user.timezone ?? `Авто · ${getBrowserTimezone()}`;

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
      <SettingsList
        staffEntry={
          isStaffUser(user)
            ? {
                subtitle: user.role === "admin" ? "Вы администратор" : "Вы редактор",
              }
            : null
        }
        offsetsLabel={formatReminderOffsetsPhrase(user.default_reminder_offsets)}
        currencyLabel={`${currency?.symbol ?? ""} ${user.base_currency}`.trim()}
        timezoneLabel={timezoneLabel}
        themeLabel={THEME_LABELS[theme.choice]}
        scheduleViewLabel={SCHEDULE_VIEW_LABELS[user.schedule_view]}
        pushEnabled={Boolean(pushSubscription.data)}
        pushPending={pushPending}
        hasPassword={user.has_password}
        supportUrl={SUPPORT_URL}
        onOffsets={() => {
          updateProfile.reset();
          setOffsetsOpen(true);
        }}
        onCurrency={() => {
          updateProfile.reset();
          setCurrencyOpen(true);
        }}
        onTimezone={() => {
          updateProfile.reset();
          setTimezoneOpen(true);
        }}
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

      <button
        type="button"
        className="border-danger/35 text-danger mx-4 mt-6 flex h-12 w-[calc(100%-32px)] items-center justify-center rounded-md border text-[15px] font-bold"
        disabled={logout.isPending}
        onClick={() => {
          void (async () => {
            const ok = await confirm({
              title: "Выйти из аккаунта?",
              description: "Закладки и результаты сохранятся — они привязаны к вашему email.",
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
        Day2 · версия {packageJson.version}
      </p>

      <NicknameSheet
        open={nicknameOpen}
        onOpenChange={setNicknameOpen}
        nickname={user.nickname}
        isPending={updateProfile.isPending}
        error={updateProfile.error}
        onSave={(nickname) => updateProfile.mutateAsync({ nickname }).then(() => undefined)}
      />
      <IntervalSheet
        open={offsetsOpen}
        onOpenChange={setOffsetsOpen}
        title="Интервалы по умолчанию"
        offsets={user.default_reminder_offsets}
        isSubmitting={updateProfile.isPending}
        onSave={async (default_reminder_offsets) => {
          try {
            await updateProfile.mutateAsync({ default_reminder_offsets });
            setOffsetsOpen(false);
          } catch {
            showToast("Не удалось сохранить интервалы");
          }
        }}
      />
      <CurrencySheet
        open={currencyOpen}
        onOpenChange={setCurrencyOpen}
        currencies={currencies.data ?? []}
        selected={user.base_currency}
        isPending={updateProfile.isPending}
        error={updateProfile.error}
        onSave={(base_currency: BaseCurrencyCode) =>
          updateProfile.mutateAsync({ base_currency }).then(() => undefined)
        }
      />
      <TimezoneSheet
        open={timezoneOpen}
        onOpenChange={setTimezoneOpen}
        selected={user.timezone}
        isPending={updateProfile.isPending}
        error={updateProfile.error}
        onSave={(timezone) => updateProfile.mutateAsync({ timezone }).then(() => undefined)}
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
