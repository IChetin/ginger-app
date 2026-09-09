import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ApiError } from "@/api/client";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { setPasswordSchema } from "@/features/auth/lib/password";
import { authErrorMessage } from "@/features/auth/lib/authErrors";
import { cn } from "@/lib/utils";

type Props = {
  isPending: boolean;
  onSave: (password: string) => Promise<void>;
  onSkip: () => void;
};

export function OfferPasswordStep({ isPending, onSave, onSkip }: Props) {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof setPasswordSchema>>({
    resolver: standardSchemaResolver(setPasswordSchema),
    defaultValues: { password: "", passwordConfirm: "" },
  });
  const passwordValue = form.watch("password");

  return (
    <div data-testid="offer-password-step">
      <h1 className="mt-[18px] text-[23px] font-extrabold tracking-[-0.02em]">
        Задайте пароль, чтобы входить быстрее
      </h1>
      <p className="text-ink-2 mt-1.5 max-w-[300px] text-sm">
        Можно пропустить и задать позже в профиле.
      </p>

      <form
        className="mt-6 flex flex-col gap-3"
        onSubmit={form.handleSubmit(async (values) => {
          setFormError(null);
          try {
            await onSave(values.password);
          } catch (error) {
            if (error instanceof ApiError) {
              setFormError(authErrorMessage(error));
              return;
            }
            setFormError("Не удалось сохранить пароль");
          }
        })}
      >
        <label className="text-ink-2 text-[13px] font-semibold" htmlFor="offer-password">
          Новый пароль
        </label>
        <PasswordInput
          id="offer-password"
          autoComplete="new-password"
          showStrength
          value={passwordValue}
          onChange={(event) => {
            form.setValue("password", event.target.value, { shouldValidate: true });
          }}
        />
        {form.formState.errors.password ? (
          <p className="text-danger text-[12px]">{form.formState.errors.password.message}</p>
        ) : null}

        <label className="text-ink-2 text-[13px] font-semibold" htmlFor="offer-password-confirm">
          Повтор пароля
        </label>
        <PasswordInput
          id="offer-password-confirm"
          autoComplete="new-password"
          {...form.register("passwordConfirm")}
        />
        {form.formState.errors.passwordConfirm ? (
          <p className="text-danger text-[12px]">{form.formState.errors.passwordConfirm.message}</p>
        ) : null}

        {formError ? <p className="text-danger text-[13px]">{formError}</p> : null}

        <button
          type="submit"
          disabled={isPending}
          className={cn(
            "bg-gold-grad text-ink-ongold mt-2 flex h-12 items-center justify-center rounded-md text-[15px] font-extrabold",
            isPending && "opacity-60",
          )}
        >
          {isPending ? "Сохраняем…" : "Сохранить пароль"}
        </button>
        <button type="button" className="text-ink-3 h-12 font-semibold" onClick={onSkip}>
          Позже
        </button>
      </form>
    </div>
  );
}
