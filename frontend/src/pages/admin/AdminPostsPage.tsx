import { useRef, useState } from "react";

import { ApiError } from "@/api/client";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { usePublicClubs } from "@/features/chips/hooks";
import {
  useAdminPosts,
  useCreatePost,
  useDeletePost,
  useDeletePostImage,
  useUpdatePost,
  useUploadPostImage,
  type FeedPostAdmin,
  type FeedPostPayload,
} from "@/features/feed/api";
import { cn } from "@/lib/utils";

const inputClass =
  "border-line-strong bg-surface-2 block h-10 w-full rounded-md border px-2.5 text-[14px]";

interface FormState {
  title: string;
  body: string;
  linkUrl: string;
  linkLabel: string;
  clubId: string;
  isPinned: boolean;
  isPromo: boolean;
  publishedAt: string;
  expiresAt: string;
}

const EMPTY: FormState = {
  title: "",
  body: "",
  linkUrl: "",
  linkLabel: "",
  clubId: "",
  isPinned: false,
  isPromo: false,
  publishedAt: "",
  expiresAt: "",
};

/** `datetime-local` ждёт местное время без зоны; пусто — публикуем сразу. */
function toLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function toForm(post: FeedPostAdmin): FormState {
  return {
    title: post.title,
    body: post.body ?? "",
    linkUrl: post.link_url ?? "",
    linkLabel: post.link_label ?? "",
    clubId: post.club?.id ?? "",
    isPinned: post.is_pinned,
    isPromo: post.is_promo,
    publishedAt: toLocalInput(post.published_at),
    expiresAt: toLocalInput(post.expires_at),
  };
}

function toPayload(form: FormState): FeedPostPayload {
  return {
    title: form.title.trim(),
    body: form.body.trim() || null,
    link_url: form.linkUrl.trim() || null,
    link_label: form.linkLabel.trim() || null,
    club_id: form.clubId || null,
    is_pinned: form.isPinned,
    is_promo: form.isPromo,
    published_at: fromLocalInput(form.publishedAt),
    expires_at: fromLocalInput(form.expiresAt),
  };
}

const stamp = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function status(post: FeedPostAdmin, now: Date): string {
  const published = new Date(post.published_at);
  if (published > now) return "выйдет " + stamp.format(published);
  if (post.expires_at && new Date(post.expires_at) <= now) return "снята с показа";
  return "в ленте с " + stamp.format(published);
}

/** Ручные записи в ленте: то, что раньше уходило постом в Telegram — анонс, афиша, итоги. */
export function AdminPostsPage() {
  const posts = useAdminPosts();
  const clubs = usePublicClubs();
  const create = useCreatePost();
  const update = useUpdatePost();
  const remove = useDeletePost();
  const uploadImage = useUploadPostImage();
  const clearImage = useDeletePostImage();
  const confirm = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const now = new Date();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const reset = () => {
    setEditing(null);
    setForm(EMPTY);
  };

  const error = [create.error, update.error, uploadImage.error].find(Boolean);

  return (
    <div className="mx-auto w-full max-w-[720px] px-3 py-4" data-testid="admin-posts">
      <h1 className="text-[20px] font-extrabold">Записи в ленте</h1>
      <p className="text-ink-2 mt-0.5 text-[13px]">
        Анонс, афиша, итоги вторника — попадают на главную выше расписания. Пуш отсюда не уходит:
        для этого есть «Рассылки».
      </p>

      <form
        className="border-line bg-surface mt-3 grid grid-cols-2 gap-1.5 rounded-md border px-3 py-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!form.title.trim()) return;
          const body = toPayload(form);
          if (editing) {
            update.mutate({ id: editing, body }, { onSuccess: reset });
          } else {
            create.mutate(body, { onSuccess: reset });
          }
        }}
      >
        <p className="text-ink col-span-2 text-[14px] font-bold">
          {editing ? "Правка записи" : "Новая запись"}
        </p>
        <input
          aria-label="Заголовок"
          placeholder="Заголовок"
          value={form.title}
          maxLength={120}
          onChange={(event) => set("title", event.target.value)}
          className={`${inputClass} col-span-2`}
        />
        <textarea
          aria-label="Текст"
          placeholder="Текст записи"
          value={form.body}
          maxLength={2000}
          rows={4}
          onChange={(event) => set("body", event.target.value)}
          className="border-line-strong bg-surface-2 col-span-2 block w-full rounded-md border px-2.5 py-2 text-[14px]"
        />
        <input
          aria-label="Ссылка внутрь приложения"
          placeholder="/tournaments"
          value={form.linkUrl}
          maxLength={200}
          onChange={(event) => set("linkUrl", event.target.value)}
          className={inputClass}
        />
        <input
          aria-label="Надпись на ссылке"
          placeholder="Надпись на ссылке"
          value={form.linkLabel}
          maxLength={40}
          onChange={(event) => set("linkLabel", event.target.value)}
          className={inputClass}
        />
        <select
          aria-label="Клуб"
          value={form.clubId}
          onChange={(event) => set("clubId", event.target.value)}
          className={inputClass}
        >
          <option value="">Без клуба</option>
          {clubs.data?.map((club) => (
            <option key={club.id} value={club.id}>
              {club.name}
            </option>
          ))}
        </select>
        <label className="text-ink-2 flex h-10 items-center gap-2 text-[13px] font-semibold">
          <input
            type="checkbox"
            checked={form.isPinned}
            onChange={(event) => set("isPinned", event.target.checked)}
            className="size-4"
          />
          Закрепить наверху
        </label>
        <label className="text-ink-2 flex h-10 items-center gap-2 text-[13px] font-semibold">
          <input
            type="checkbox"
            checked={form.isPromo}
            onChange={(event) => set("isPromo", event.target.checked)}
            className="size-4"
          />
          Акция — ещё и в раздел «Акции»
        </label>
        <label className="text-ink-3 text-[11px] font-bold">
          Публикация
          <input
            aria-label="Публикация"
            type="datetime-local"
            value={form.publishedAt}
            onChange={(event) => set("publishedAt", event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="text-ink-3 text-[11px] font-bold">
          Снять с показа
          <input
            aria-label="Снять с показа"
            type="datetime-local"
            value={form.expiresAt}
            onChange={(event) => set("expiresAt", event.target.value)}
            className={inputClass}
          />
        </label>
        <button
          type="submit"
          disabled={create.isPending || update.isPending || !form.title.trim()}
          className="bg-gold-grad text-ink-ongold col-span-2 mt-1 h-10 rounded-md text-[14px] font-bold disabled:opacity-45"
        >
          {editing ? "Сохранить" : "Опубликовать"}
        </button>
        {editing ? (
          <button
            type="button"
            onClick={reset}
            className="text-ink-2 col-span-2 h-8 text-[13px] font-bold"
          >
            Отменить правку
          </button>
        ) : null}
        {error ? (
          <p role="alert" className="text-danger col-span-2 text-[12px] font-semibold">
            {error instanceof ApiError ? error.message : "Не удалось сохранить"}
          </p>
        ) : null}
      </form>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        aria-label="Картинка записи"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file && editing) {
            uploadImage.mutate({ id: editing, file });
          }
        }}
      />

      <div className="mt-3 flex flex-col gap-1.5">
        {posts.data?.map((post) => (
          <div
            key={post.id}
            data-testid="admin-post"
            className={cn(
              "border-line bg-surface rounded-md border px-3 py-2",
              editing === post.id && "border-line-gold",
            )}
          >
            <div className="flex items-start gap-2">
              {post.image_url ? (
                <img
                  src={post.image_url}
                  alt=""
                  className="bg-surface-2 h-12 w-12 shrink-0 rounded-md object-cover"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="text-ink truncate text-[14px] font-bold">
                  {post.is_pinned ? "📌 " : ""}
                  {post.auto_kind ? "Авто · " : ""}
                  {post.title}
                </p>
                <p className="text-ink-3 truncate text-[12px]">
                  {status(post, now)}
                  {post.club ? " · " + post.club.name : ""}
                  {post.author_nickname ? " · " + post.author_nickname : ""}
                </p>
              </div>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(post.id);
                  setForm(toForm(post));
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="text-gold h-8 text-[12px] font-bold"
              >
                Править
              </button>
              <button
                type="button"
                disabled={uploadImage.isPending}
                onClick={() => {
                  setEditing(post.id);
                  setForm(toForm(post));
                  fileInput.current?.click();
                }}
                className="text-ink-2 h-8 text-[12px] font-bold"
              >
                {post.image_url ? "Заменить картинку" : "Добавить картинку"}
              </button>
              {post.image_url ? (
                <button
                  type="button"
                  disabled={clearImage.isPending}
                  onClick={() => clearImage.mutate(post.id)}
                  className="text-ink-2 h-8 text-[12px] font-bold"
                >
                  Убрать картинку
                </button>
              ) : null}
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => {
                  void (async () => {
                    const ok = await confirm({
                      title: "Удалить запись?",
                      description: "«" + post.title + "» пропадёт из ленты.",
                      confirmLabel: "Удалить",
                      cancelLabel: "Отмена",
                      variant: "danger",
                    });
                    if (!ok) return;
                    remove.mutate(post.id, {
                      onSuccess: () => {
                        if (editing === post.id) reset();
                      },
                    });
                  })();
                }}
                aria-label={"Удалить запись " + post.title}
                className="text-danger ml-auto h-8 text-[12px] font-bold"
              >
                Удалить
              </button>
            </div>
          </div>
        ))}
        {posts.isSuccess && posts.data.length === 0 ? (
          <p className="text-ink-3 text-center text-[13px]">Записей пока нет</p>
        ) : null}
      </div>
    </div>
  );
}
