import { apiGet, apiPost, apiPostForm } from "@/api/client";
import type { Thread, ThreadSummary } from "@/api/types/threads";

const ADMIN = "/api/v1/admin";

export type InboxScope = "open" | "all";

export const fetchAdminThreads = (scope: InboxScope): Promise<ThreadSummary[]> =>
  apiGet(`${ADMIN}/threads?scope=${scope}`);

export const fetchAdminThread = (id: string): Promise<Thread> => apiGet(`${ADMIN}/threads/${id}`);

export const postAdminMessage = (id: string, body: string): Promise<Thread> =>
  apiPost(`${ADMIN}/threads/${id}/messages`, { body });

export function postAdminImage(
  id: string,
  file: Blob,
  filename: string,
  body?: string,
): Promise<Thread> {
  const form = new FormData();
  form.append("file", file, filename);
  if (body) form.append("body", body);
  return apiPostForm(`${ADMIN}/threads/${id}/images`, form);
}

export const closeAdminThread = (id: string): Promise<Thread> =>
  apiPost(`${ADMIN}/threads/${id}/close`);

export const adminAttachmentUrl = (threadId: string, attachmentId: string): string =>
  `${ADMIN}/threads/${threadId}/attachments/${attachmentId}`;
