import { useEffect, useState } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";

import { ApiError } from "@/api/client";
import type { ThreadTopic } from "@/api/types/threads";
import { Conversation } from "@/features/threads/components/Conversation";
import { fetchThreads, threadAttachmentUrl } from "@/features/threads/api";
import {
  useCreateThread,
  usePostThreadMessage,
  useThread,
  useThreads,
} from "@/features/threads/hooks";
import { TOPIC_LABELS, shortTime, statusLabel } from "@/features/threads/lib/format";
import { cn } from "@/lib/utils";

const PICKABLE: ThreadTopic[] = ["question", "hand_review", "data_change"];

const PLACEHOLDERS: Record<ThreadTopic, string> = {
  question: "Вопрос по клубу или приложению",
  hand_review: "Вставьте историю раздачи или опишите её. Скриншот — после отправки, скрепкой",
  data_change: "Что изменить: ник, ID в клубе, дату рождения…",
  chip_request: "Что не так с заявкой?",
};

function DialogsList() {
  const threads = useThreads();
  return (
    <div className="bg-bg min-h-full px-3 pt-3 pb-4" data-testid="dialogs-page">
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-[20px] font-extrabold tracking-tight">Диалоги</h1>
        <Link
          to="/dialogs/new"
          className="bg-gold-grad text-ink-ongold flex h-9 items-center rounded-md px-3 text-[14px] font-bold"
        >
          Написать
        </Link>
      </div>
      {threads.isPending ? <div className="bg-surface mt-3 h-24 rounded-md" /> : null}
      {threads.data?.length === 0 ? (
        <div className="border-line bg-surface mt-3 rounded-md border px-3 py-4">
          <p className="text-ink text-[15px] font-bold">Здесь переписка с менеджером</p>
          <p className="text-ink-2 mt-1 text-[13px]">
            Вопросы по клубам, разборы раздач, правка данных. Каждое обращение — отдельный диалог со
            статусом.
          </p>
        </div>
      ) : null}
      <div className="mt-3 flex flex-col gap-1.5">
        {threads.data?.map((thread) => (
          <Link
            key={thread.id}
            to={`/dialogs/${thread.id}`}
            data-testid="dialog-row"
            className={cn(
              "bg-surface block rounded-md border px-2.5 py-2",
              thread.unread ? "border-line-gold" : "border-line",
            )}
          >
            <div className="flex items-center gap-2">
              {thread.unread ? (
                <span className="bg-gold h-2 w-2 shrink-0 rounded-full" aria-label="Новый ответ" />
              ) : null}
              <span className="text-ink min-w-0 flex-1 truncate text-[14px] font-bold">
                {thread.subject}
              </span>
              <span className="text-ink-3 shrink-0 text-[11.5px]">
                {shortTime(thread.last_message_at)}
              </span>
            </div>
            <div className="text-ink-3 mt-0.5 flex gap-2 text-[12px]">
              <span className="min-w-0 flex-1 truncate">{thread.last_message_preview}</span>
              <span className="shrink-0 font-semibold">{statusLabel(thread.status, "player")}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function NewThread() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requestId = params.get("request");
  const initialTopic = (params.get("topic") as ThreadTopic | null) ?? "question";
  const [topic, setTopic] = useState<ThreadTopic>(
    requestId ? "chip_request" : PICKABLE.includes(initialTopic) ? initialTopic : "question",
  );
  const [text, setText] = useState(params.get("text") ?? "");
  const [existing, setExisting] = useState<string | null>(null);
  const create = useCreateThread();

  // По заявке переписка одна — если она уже есть, сразу в неё.
  useEffect(() => {
    if (!requestId) return;
    let cancelled = false;
    void fetchThreads(requestId)
      .then((found) => {
        if (!cancelled && found[0]) setExisting(found[0].id);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  if (existing) return <Navigate to={`/dialogs/${existing}`} replace />;

  const submit = async () => {
    try {
      const thread = await create.mutateAsync({
        topic,
        body: text.trim(),
        ...(requestId ? { chip_request_id: requestId } : {}),
      });
      navigate(`/dialogs/${thread.id}`, { replace: true });
    } catch {
      // ошибка ниже
    }
  };

  return (
    <div className="bg-bg min-h-full px-3 pb-4" data-testid="new-thread-page">
      <header className="flex items-center gap-2 pt-2.5 pb-1">
        <Link to="/dialogs" className="text-gold text-[13px] font-bold">
          ← Диалоги
        </Link>
      </header>
      <h1 className="text-[20px] font-extrabold tracking-tight">
        {requestId ? "Написать по заявке" : "Написать менеджеру"}
      </h1>
      {!requestId ? (
        <div className="mt-2 flex gap-1.5" role="radiogroup" aria-label="Тема">
          {PICKABLE.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={topic === value}
              onClick={() => setTopic(value)}
              className={cn(
                "h-8 rounded-full border px-3 text-[12.5px] font-bold",
                topic === value
                  ? "border-line-gold bg-gold-soft text-gold"
                  : "border-line bg-surface text-ink-2",
              )}
            >
              {TOPIC_LABELS[value]}
            </button>
          ))}
        </div>
      ) : null}
      <textarea
        aria-label="Сообщение"
        placeholder={PLACEHOLDERS[topic]}
        value={text}
        rows={6}
        onChange={(event) => setText(event.target.value)}
        className="border-line-strong bg-surface text-ink mt-2 block w-full rounded-md border px-2.5 py-2 text-[14px]"
      />
      <button
        type="button"
        disabled={create.isPending || !text.trim()}
        onClick={() => void submit()}
        className="bg-gold-grad text-ink-ongold mt-2 h-11 w-full rounded-md text-[15px] font-bold disabled:opacity-45"
      >
        Отправить
      </button>
      <p className="text-ink-3 mt-2 text-[12px]">
        12:00–03:00 МСК — на связи, в другое время постараемся.
      </p>
      {create.isError ? (
        <p role="alert" className="text-danger mt-1 text-[12px] font-semibold">
          {create.error instanceof ApiError ? create.error.message : "Не удалось отправить"}
        </p>
      ) : null}
    </div>
  );
}

function ThreadScreen() {
  const { threadId = "" } = useParams();
  const thread = useThread(threadId);
  const post = usePostThreadMessage(threadId);

  if (thread.isPending) return <div className="bg-surface mx-3 mt-4 h-48 rounded-md" />;
  if (thread.isError) {
    return (
      <div className="mx-3 mt-4">
        <p className="text-ink text-[15px] font-bold">Диалог не найден</p>
        <Link to="/dialogs" className="text-gold mt-2 inline-block text-[13px] font-bold">
          К диалогам
        </Link>
      </div>
    );
  }
  const data = thread.data;
  return (
    <div className="bg-bg min-h-full px-3" data-testid="thread-page">
      <header className="border-line bg-bg/95 sticky top-0 z-10 border-b pt-2.5 pb-2 backdrop-blur-[12px]">
        <div className="flex items-center gap-2">
          <Link to="/dialogs" className="text-gold text-[13px] font-bold">
            ← Диалоги
          </Link>
          <span className="flex-1" />
          <span className="text-ink-3 text-[12px] font-semibold">
            {statusLabel(data.status, "player")}
          </span>
        </div>
        <h1 className="mt-0.5 truncate text-[17px] font-extrabold tracking-tight">
          {data.subject}
        </h1>
        <p className="text-ink-3 text-[11.5px]">{data.manager_hours}</p>
        {data.chip_request_id ? (
          <Link to={`/chips/${data.chip_request_id}`} className="text-gold text-[12px] font-bold">
            Открыть заявку
          </Link>
        ) : null}
      </header>
      <Conversation
        thread={data}
        viewer="player"
        attachmentUrl={(attachmentId) => threadAttachmentUrl(data.id, attachmentId)}
        pending={post.isPending}
        error={post.error}
        closedHint="Диалог закрыт. Новое сообщение откроет его снова."
        onSend={(vars) =>
          post.mutateAsync(
            vars.file
              ? { file: vars.file, filename: vars.filename ?? "image.jpg", body: vars.body }
              : { body: vars.body ?? "" },
          )
        }
      />
    </div>
  );
}

/** Диалоги с менеджером (экраны §3.4): список, новое обращение, переписка. */
export function DialogsPage() {
  return (
    <Routes>
      <Route index element={<DialogsList />} />
      <Route path="new" element={<NewThread />} />
      <Route path=":threadId" element={<ThreadScreen />} />
    </Routes>
  );
}
