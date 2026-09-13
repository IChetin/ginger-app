export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    retry_after?: number | null;
    attempts_left?: number | null;
    active_session_id?: string | null;
    result_id?: string | null;
    server?: unknown;
  };
}
