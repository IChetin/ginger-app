import { apiGet, apiPost, apiPostForm } from "@/api/client";
import type { Thread, ThreadCreatePayload, ThreadSummary } from "@/api/types/threads";

export function fetchThreads(chipRequestId?: string): Promise<ThreadSummary[]> {
  const query = chipRequestId ? `?chip_request_id=${encodeURIComponent(chipRequestId)}` : "";
  return apiGet(`/api/v1/me/threads${query}`);
}

export function createThread(body: ThreadCreatePayload): Promise<Thread> {
  return apiPost("/api/v1/me/threads", body);
}

export function fetchThread(id: string): Promise<Thread> {
  return apiGet(`/api/v1/me/threads/${id}`);
}

export function postThreadMessage(id: string, body: string): Promise<Thread> {
  return apiPost(`/api/v1/me/threads/${id}/messages`, { body });
}

export function postThreadImage(
  id: string,
  file: Blob,
  filename: string,
  body?: string,
): Promise<Thread> {
  const form = new FormData();
  form.append("file", file, filename);
  if (body) form.append("body", body);
  return apiPostForm(`/api/v1/me/threads/${id}/images`, form);
}

export function threadAttachmentUrl(threadId: string, attachmentId: string): string {
  return `/api/v1/me/threads/${threadId}/attachments/${attachmentId}`;
}
