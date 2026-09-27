import { apiDelete, apiGet, apiPost, apiPostForm, apiPut } from "@/api/client";
import type { PokerApp, Tournament } from "@/api/types/tournaments";

export interface WinItem {
  id: string;
  player_nickname: string;
  club: { id: string; name: string; app: PokerApp } | null;
  tournament_name: string;
  place: number | null;
  prize_amount: string;
  currency_code: string;
  currency_symbol: string | null;
  won_on: string;
}

/** Запись в ленте руками менеджера: анонс, афиша, итоги вторника. */
export interface FeedPost {
  id: string;
  title: string;
  body: string | null;
  image_url: string | null;
  link_url: string | null;
  link_label: string | null;
  club: { id: string; name: string; app: PokerApp } | null;
  is_pinned: boolean;
  published_at: string;
  expires_at: string | null;
  /** Автозапись о турнире (Иван, 27.09): «pick» — старт из Editor's Pick, «major» — Major дня. */
  auto_kind?: "pick" | "major" | null;
  tournament?: Tournament | null;
}

export interface FeedPostAdmin extends FeedPost {
  author_nickname: string | null;
  created_at: string;
}

export interface FeedPostPayload {
  title: string;
  body?: string | null;
  link_url?: string | null;
  link_label?: string | null;
  club_id?: string | null;
  is_pinned: boolean;
  published_at?: string | null;
  expires_at?: string | null;
}

/** Лента: новости, Major дня (крупнейшая гарантия каждого клуба), вечер в клубах, выигрыши. */
export interface Feed {
  posts: FeedPost[];
  majors: Tournament[];
  evening: Tournament[];
  wins: WinItem[];
}

export interface WinCreatePayload {
  player_nickname: string;
  club_id?: string | null;
  tournament_name: string;
  place?: number | null;
  prize_amount: string;
  currency_code: string;
  won_on?: string | null;
}

// Запросы отдельно от хуков: тесты подменяют модуль целиком.
export const fetchFeed = () => apiGet<Feed>("/api/v1/feed");
export const fetchAdminWins = () => apiGet<WinItem[]>("/api/v1/admin/wins");
export const createWin = (body: WinCreatePayload) => apiPost<WinItem>("/api/v1/admin/wins", body);
export const deleteWin = (id: string) => apiDelete(`/api/v1/admin/wins/${id}`);

export const fetchAdminPosts = () => apiGet<FeedPostAdmin[]>("/api/v1/admin/posts");
export const createPost = (body: FeedPostPayload) =>
  apiPost<FeedPostAdmin>("/api/v1/admin/posts", body);
export const updatePost = (id: string, body: FeedPostPayload) =>
  apiPut<FeedPostAdmin>(`/api/v1/admin/posts/${id}`, body);
export const deletePost = (id: string) => apiDelete(`/api/v1/admin/posts/${id}`);

export function uploadPostImage(id: string, file: Blob, filename: string) {
  const form = new FormData();
  form.append("file", file, filename);
  return apiPostForm<FeedPostAdmin>(`/api/v1/admin/posts/${id}/image`, form);
}

export const deletePostImage = (id: string) =>
  apiDelete<FeedPostAdmin>(`/api/v1/admin/posts/${id}/image`, { allowEmpty: false });
