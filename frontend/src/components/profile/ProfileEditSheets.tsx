import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ProfileSheet } from "@/components/profile/ProfileSheet";
import { nicknameErrorMessage } from "@/features/auth/lib/profileErrors";
import { NICKNAME_HINT, nicknameFormSchema } from "@/lib/nickname";

export function NicknameSheet({
  open,
  onOpenChange,
  nickname,
  isPending,
  error,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nickname: string;
  isPending: boolean;
  error: Error | null;
  onSave: (nickname: string) => Promise<void>;
}) {
  const form = useForm<z.infer<typeof nicknameFormSchema>>({
    resolver: standardSchemaResolver(nicknameFormSchema),
    defaultValues: { nickname },
  });
  useEffect(() => {
    if (open) form.reset({ nickname });
  }, [form, nickname, open]);
  // A second submit (Enter while the button re-renders) used to fire a parallel
  // PATCH; the loser of the race painted the error over a successful save.
  const inFlightRef = useRef(false);
  const serverError = nicknameErrorMessage(error);

  return (
    <ProfileSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Изменить никнейм"
      description={`От 2 до 32 символов. ${NICKNAME_HINT}.`}
    >
      <form
        onSubmit={form.handleSubmit(async (values) => {
          if (inFlightRef.current) {
            return;
          }
          inFlightRef.current = true;
          try {
            await onSave(values.nickname.trim());
            onOpenChange(false);
          } catch {
            // Mutation state renders the server error below.
          } finally {
            inFlightRef.current = false;
          }
        })}
      >
        <label className="text-ink-2 text-[13px] font-semibold" htmlFor="profile-nickname">
          Никнейм
        </label>
        <input
          id="profile-nickname"
          autoComplete="nickname"
          className="tracker-input mt-1.5"
          {...form.register("nickname")}
        />
        {form.formState.errors.nickname ? (
          <p className="text-danger mt-1 text-[12px]">{form.formState.errors.nickname.message}</p>
        ) : null}
        {serverError ? (
          <p className="text-danger mt-1 text-[12px]" data-testid="nickname-error">
            {serverError}
          </p>
        ) : null}
        <SaveButton pending={isPending || form.formState.isSubmitting} />
      </form>
    </ProfileSheet>
  );
}

const emailSchema = z.object({
  email: z.string().trim().email("Введите корректный email").or(z.literal("")),
});

export function EmailSheet({
  open,
  onOpenChange,
  email,
  isPending,
  error,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string | null;
  isPending: boolean;
  error: Error | null;
  onSave: (email: string | null) => Promise<void>;
}) {
  const form = useForm<z.infer<typeof emailSchema>>({
    resolver: standardSchemaResolver(emailSchema),
    defaultValues: { email: email ?? "" },
  });
  useEffect(() => {
    if (open) form.reset({ email: email ?? "" });
  }, [email, form, open]);

  return (
    <ProfileSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Email"
      description="Запасной контакт для аккаунта."
    >
      <form
        onSubmit={form.handleSubmit(async (values) => {
          try {
            await onSave(values.email || null);
            onOpenChange(false);
          } catch {
            // Mutation state renders the server error below.
          }
        })}
      >
        <label className="text-ink-2 text-[13px] font-semibold" htmlFor="profile-email">
          Email
        </label>
        <input
          id="profile-email"
          type="email"
          autoComplete="email"
          className="tracker-input mt-1.5"
          {...form.register("email")}
        />
        {form.formState.errors.email ? (
          <p className="text-danger mt-1 text-[12px]">{form.formState.errors.email.message}</p>
        ) : null}
        {error ? <p className="text-danger mt-1 text-[12px]">Не удалось сохранить email</p> : null}
        <SaveButton pending={isPending} />
      </form>
    </ProfileSheet>
  );
}

function SaveButton({ pending }: { pending: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-gold-grad text-ink-ongold mt-4 flex h-12 w-full items-center justify-center rounded-md text-[15px] font-extrabold disabled:opacity-60"
    >
      Сохранить
    </button>
  );
}
