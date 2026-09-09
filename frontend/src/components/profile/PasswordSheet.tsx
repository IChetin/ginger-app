import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ApiError } from "@/api/client";
import { ProfileSheet } from "@/components/profile/ProfileSheet";
import { changePasswordSchema, setPasswordSchema } from "@/features/auth/lib/password";

export function PasswordSheet({
  open,
  onOpenChange,
  hasPassword,
  isPending,
  error,
  onSetPassword,
  onChangePassword,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasPassword: boolean;
  isPending: boolean;
  error: Error | null;
  onSetPassword: (password: string) => Promise<void>;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}) {
  const setForm = useForm<z.infer<typeof setPasswordSchema>>({
    resolver: standardSchemaResolver(setPasswordSchema),
    defaultValues: { password: "", passwordConfirm: "" },
  });
  const changeForm = useForm<z.infer<typeof changePasswordSchema>>({
    resolver: standardSchemaResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", passwordConfirm: "" },
  });

  useEffect(() => {
    if (open) {
      setForm.reset({ password: "", passwordConfirm: "" });
      changeForm.reset({ currentPassword: "", newPassword: "", passwordConfirm: "" });
    }
  }, [changeForm, open, setForm]);

  const invalidCurrent = error instanceof ApiError && error.code === "invalid_credentials";

  return (
    <ProfileSheet
      open={open}
      onOpenChange={onOpenChange}
      title={hasPassword ? "Изменить пароль" : "Задать пароль"}
      description={
        hasPassword
          ? "Введите текущий и новый пароль."
          : "Минимум 8 символов. Чтобы входить быстрее, без письма."
      }
    >
      {hasPassword ? (
        <form
          onSubmit={changeForm.handleSubmit(async (values) => {
            try {
              await onChangePassword(values.currentPassword, values.newPassword);
              onOpenChange(false);
            } catch {
              // Mutation state renders the server error below.
            }
          })}
        >
          <label className="text-ink-2 text-[13px] font-semibold" htmlFor="current-password">
            Текущий пароль
          </label>
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            className="tracker-input mt-1.5"
            {...changeForm.register("currentPassword")}
          />
          {changeForm.formState.errors.currentPassword ? (
            <p className="text-danger mt-1 text-[12px]">
              {changeForm.formState.errors.currentPassword.message}
            </p>
          ) : null}

          <label className="text-ink-2 mt-3 block text-[13px] font-semibold" htmlFor="new-password">
            Новый пароль
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            className="tracker-input mt-1.5"
            {...changeForm.register("newPassword")}
          />
          {changeForm.formState.errors.newPassword ? (
            <p className="text-danger mt-1 text-[12px]">
              {changeForm.formState.errors.newPassword.message}
            </p>
          ) : null}

          <label
            className="text-ink-2 mt-3 block text-[13px] font-semibold"
            htmlFor="new-password-confirm"
          >
            Повтор пароля
          </label>
          <input
            id="new-password-confirm"
            type="password"
            autoComplete="new-password"
            className="tracker-input mt-1.5"
            {...changeForm.register("passwordConfirm")}
          />
          {changeForm.formState.errors.passwordConfirm ? (
            <p className="text-danger mt-1 text-[12px]">
              {changeForm.formState.errors.passwordConfirm.message}
            </p>
          ) : null}

          {invalidCurrent ? (
            <p className="text-danger mt-2 text-[12px]">Неверный текущий пароль</p>
          ) : error ? (
            <p className="text-danger mt-2 text-[12px]">Не удалось сменить пароль</p>
          ) : null}

          <button
            type="submit"
            disabled={isPending}
            className="bg-gold-grad text-ink-ongold mt-4 flex h-12 w-full items-center justify-center rounded-md text-[15px] font-extrabold disabled:opacity-60"
          >
            {isPending ? "Сохраняем…" : "Сохранить"}
          </button>
        </form>
      ) : (
        <form
          onSubmit={setForm.handleSubmit(async (values) => {
            try {
              await onSetPassword(values.password);
              onOpenChange(false);
            } catch {
              // Mutation state renders the server error below.
            }
          })}
        >
          <label className="text-ink-2 text-[13px] font-semibold" htmlFor="set-password">
            Пароль
          </label>
          <input
            id="set-password"
            type="password"
            autoComplete="new-password"
            className="tracker-input mt-1.5"
            {...setForm.register("password")}
          />
          {setForm.formState.errors.password ? (
            <p className="text-danger mt-1 text-[12px]">
              {setForm.formState.errors.password.message}
            </p>
          ) : null}

          <label
            className="text-ink-2 mt-3 block text-[13px] font-semibold"
            htmlFor="set-password-confirm"
          >
            Повтор пароля
          </label>
          <input
            id="set-password-confirm"
            type="password"
            autoComplete="new-password"
            className="tracker-input mt-1.5"
            {...setForm.register("passwordConfirm")}
          />
          {setForm.formState.errors.passwordConfirm ? (
            <p className="text-danger mt-1 text-[12px]">
              {setForm.formState.errors.passwordConfirm.message}
            </p>
          ) : null}

          {error ? <p className="text-danger mt-2 text-[12px]">Не удалось задать пароль</p> : null}

          <button
            type="submit"
            disabled={isPending}
            className="bg-gold-grad text-ink-ongold mt-4 flex h-12 w-full items-center justify-center rounded-md text-[15px] font-extrabold disabled:opacity-60"
          >
            {isPending ? "Сохраняем…" : "Сохранить"}
          </button>
        </form>
      )}
    </ProfileSheet>
  );
}
