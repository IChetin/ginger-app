import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { Thread } from "@/api/types/threads";
import * as api from "@/features/threads/api";
import { DialogsPage } from "@/pages/DialogsPage";

vi.mock("@/features/threads/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/threads/api")>();
  return {
    ...original,
    fetchThreads: vi.fn(),
    fetchThread: vi.fn(),
    createThread: vi.fn(),
    postThreadMessage: vi.fn(),
  };
});

function thread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "th1",
    topic: "question",
    status: "answered",
    subject: "Вопрос",
    chip_request_id: null,
    last_message_at: "2026-09-13T12:00:00Z",
    last_message_preview: "ID клуба 1049607",
    unread: true,
    player_id: "p1",
    player_nickname: null,
    player_kind: null,
    manager_hours: "12:00–03:00 — на связи, в другое время постараемся",
    messages: [
      {
        id: "m1",
        from_manager: false,
        author_nickname: "fox",
        body: "Как зайти?",
        attachment_id: null,
        created_at: "2026-09-13T11:00:00Z",
      },
      {
        id: "m2",
        from_manager: true,
        author_nickname: "editor",
        body: "ID клуба 1049607",
        attachment_id: null,
        created_at: "2026-09-13T12:00:00Z",
      },
    ],
    ...overrides,
  };
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/dialogs/*" element={<DialogsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("DialogsPage", () => {
  it("lists threads with unread marker", async () => {
    vi.mocked(api.fetchThreads).mockResolvedValue([thread()]);
    renderAt("/dialogs");
    const row = await screen.findByTestId("dialog-row");
    expect(row).toHaveTextContent("ID клуба 1049607");
    expect(screen.getByLabelText("Новый ответ")).toBeInTheDocument();
  });

  it("shows conversation and sends a message", async () => {
    vi.mocked(api.fetchThread).mockResolvedValue(thread());
    vi.mocked(api.postThreadMessage).mockResolvedValue(thread({ status: "open" }));
    renderAt("/dialogs/th1");
    expect(await screen.findAllByTestId("thread-message")).toHaveLength(2);
    expect(screen.getByText("Менеджер")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Сообщение"), { target: { value: "Спасибо" } });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    await waitFor(() => expect(api.postThreadMessage).toHaveBeenCalledWith("th1", "Спасибо"));
  });

  it("opens the existing chip request thread instead of a new one", async () => {
    vi.mocked(api.fetchThreads).mockResolvedValue([thread({ id: "th9", chip_request_id: "r1" })]);
    vi.mocked(api.fetchThread).mockResolvedValue(thread({ id: "th9", subject: "Заявка от 13.09" }));
    renderAt("/dialogs/new?request=r1");
    expect(await screen.findByText("Заявка от 13.09")).toBeInTheDocument();
    expect(api.fetchThreads).toHaveBeenCalledWith("r1");
  });
});
