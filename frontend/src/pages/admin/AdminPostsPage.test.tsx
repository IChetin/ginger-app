import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FeedPostAdmin } from "@/features/feed/feedApi";
import * as feedApi from "@/features/feed/feedApi";
import { AdminPostsPage } from "@/pages/admin/AdminPostsPage";
import { renderWithProviders } from "@/test/render";

vi.mock("@/features/chips/hooks", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/chips/hooks")>();
  return {
    ...original,
    usePublicClubs: () => ({ data: [{ id: "c1", name: "Ginger21" }] }),
  };
});

vi.mock("@/features/feed/feedApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/feed/feedApi")>();
  return {
    ...original,
    fetchAdminPosts: vi.fn(),
    createPost: vi.fn(),
    updatePost: vi.fn(),
    deletePost: vi.fn(),
  };
});

function makePost(overrides: Partial<FeedPostAdmin> = {}): FeedPostAdmin {
  return {
    id: "post1",
    title: "Вторник в клубе",
    body: null,
    image_url: null,
    link_url: null,
    link_label: null,
    club: null,
    is_pinned: false,
    published_at: "2026-09-22T09:00:00Z",
    expires_at: null,
    author_nickname: "admin",
    created_at: "2026-09-22T09:00:00Z",
    ...overrides,
  };
}

describe("AdminPostsPage", () => {
  beforeEach(() => {
    vi.mocked(feedApi.fetchAdminPosts).mockResolvedValue([makePost()]);
    vi.mocked(feedApi.createPost).mockResolvedValue(makePost({ id: "post2" }));
    vi.mocked(feedApi.updatePost).mockResolvedValue(makePost());
  });

  it("публикует запись с текстом и ссылкой внутрь приложения", async () => {
    renderWithProviders(<AdminPostsPage />);
    await screen.findByTestId("admin-post");

    fireEvent.change(screen.getByLabelText("Заголовок"), { target: { value: " Аддон-день " } });
    fireEvent.change(screen.getByLabelText("Текст"), { target: { value: "Во всех клубах." } });
    fireEvent.change(screen.getByLabelText("Ссылка внутрь приложения"), {
      target: { value: "/tournaments" },
    });
    fireEvent.click(screen.getByLabelText("Закрепить наверху"));
    fireEvent.click(screen.getByRole("button", { name: "Опубликовать" }));

    await waitFor(() => expect(feedApi.createPost).toHaveBeenCalled());
    expect(vi.mocked(feedApi.createPost).mock.calls[0]?.[0]).toEqual({
      title: "Аддон-день",
      body: "Во всех клубах.",
      link_url: "/tournaments",
      link_label: null,
      club_id: null,
      is_pinned: true,
      published_at: null,
      expires_at: null,
    });
  });

  it("правит существующую запись", async () => {
    renderWithProviders(<AdminPostsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Править" }));

    expect(screen.getByLabelText("Заголовок")).toHaveValue("Вторник в клубе");
    fireEvent.change(screen.getByLabelText("Заголовок"), {
      target: { value: "Вторник перенесён" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => expect(feedApi.updatePost).toHaveBeenCalled());
    const [id, body] = vi.mocked(feedApi.updatePost).mock.calls[0] ?? [];
    expect(id).toBe("post1");
    expect(body?.title).toBe("Вторник перенесён");
  });

  it("удаляет запись после подтверждения", async () => {
    renderWithProviders(<AdminPostsPage />);
    fireEvent.click(await screen.findByLabelText("Удалить запись Вторник в клубе"));
    fireEvent.click(await screen.findByRole("button", { name: "Удалить" }));

    await waitFor(() => expect(feedApi.deletePost).toHaveBeenCalled());
    expect(vi.mocked(feedApi.deletePost).mock.calls[0]?.[0]).toBe("post1");
  });

  it("показывает, что отложенная запись ещё не в ленте", async () => {
    vi.mocked(feedApi.fetchAdminPosts).mockResolvedValue([
      makePost({ published_at: "2099-01-01T09:00:00Z" }),
    ]);
    renderWithProviders(<AdminPostsPage />);
    expect(await screen.findByText(/выйдет/)).toBeInTheDocument();
  });
});
