import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import type { BaseCurrencyCode } from "@/api/types/auth";
import type { CurrencyBrief } from "@/api/types/schedule";
import { ProfileSheet } from "@/components/profile/ProfileSheet";
import { nicknameErrorMessage } from "@/features/auth/lib/profileErrors";
import { NICKNAME_HINT, nicknameFormSchema } from "@/lib/nickname";
import { getBrowserTimezone } from "@/lib/time";
import { formatUtcOffset, listIanaTimeZones } from "@/lib/timezoneOffset";
import { cn } from "@/lib/utils";

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

export function CurrencySheet({
  open,
  onOpenChange,
  currencies,
  selected,
  isPending,
  error,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currencies: CurrencyBrief[];
  selected: string;
  isPending: boolean;
  error: Error | null;
  onSave: (currency: BaseCurrencyCode) => Promise<void>;
}) {
  return (
    <ProfileSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Базовая валюта"
      description="В неё пересчитываются бай-ины и суммы."
    >
      <div className="border-line bg-surface-2 overflow-hidden rounded-md border">
        {currencies.map((currency) => (
          <button
            key={currency.code}
            type="button"
            disabled={isPending}
            className={cn(
              "border-line flex w-full items-center border-t px-4 py-3.5 text-left first:border-t-0",
              currency.code === selected && "bg-gold-soft text-gold",
            )}
            onClick={() => {
              void onSave(currency.code as BaseCurrencyCode)
                .then(() => onOpenChange(false))
                .catch(() => undefined);
            }}
          >
            <span className="w-8 text-[17px] font-bold">{currency.symbol}</span>
            <span className="font-semibold">{currency.code}</span>
            {currency.code === selected ? <span className="ml-auto">✓</span> : null}
          </button>
        ))}
      </div>
      {error ? <p className="text-danger mt-2 text-[12px]">Не удалось сменить валюту</p> : null}
    </ProfileSheet>
  );
}

export function TimezoneSheet({
  open,
  onOpenChange,
  selected,
  isPending,
  error,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = automatic (browser). */
  selected: string | null;
  isPending: boolean;
  error: Error | null;
  onSave: (timezone: string | null) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const browserZone = getBrowserTimezone();
  const zones = useMemo(() => listIanaTimeZones(), []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return zones;
    return zones.filter((zone) => zone.toLowerCase().includes(q));
  }, [query, zones]);

  return (
    <ProfileSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Часовой пояс"
      description="Для «времени у вас» на карточках и в закладках."
    >
      <div className="border-line bg-surface-2 mb-3 overflow-hidden rounded-md border">
        <button
          type="button"
          disabled={isPending}
          className={cn(
            "flex w-full items-center px-4 py-3.5 text-left",
            selected == null && "bg-gold-soft text-gold",
          )}
          onClick={() => {
            void onSave(null)
              .then(() => onOpenChange(false))
              .catch(() => undefined);
          }}
        >
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Автоматически</span>
            <span className="text-ink-3 mt-0.5 block text-[12px] font-normal">
              сейчас: {browserZone}
            </span>
          </span>
          {selected == null ? <span className="ml-2">✓</span> : null}
        </button>
      </div>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Поиск зоны…"
        className="tracker-input"
        aria-label="Поиск часового пояса"
      />
      <div className="border-line bg-surface-2 mt-3 max-h-[40vh] overflow-y-auto rounded-md border">
        {filtered.map((zone) => (
          <button
            key={zone}
            type="button"
            disabled={isPending}
            className={cn(
              "border-line flex w-full items-center border-t px-4 py-3 text-left first:border-t-0",
              selected === zone && "bg-gold-soft text-gold",
            )}
            onClick={() => {
              void onSave(zone)
                .then(() => onOpenChange(false))
                .catch(() => undefined);
            }}
          >
            <span className="min-w-0 flex-1 font-mono text-[13px] font-semibold">{zone}</span>
            <span className="text-ink-3 ml-2 shrink-0 text-[12px]">{formatUtcOffset(zone)}</span>
            {selected === zone ? <span className="ml-2">✓</span> : null}
          </button>
        ))}
      </div>
      {error ? <p className="text-danger mt-2 text-[12px]">Не удалось сменить пояс</p> : null}
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
