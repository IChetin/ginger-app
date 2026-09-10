export type UserRole = "user" | "editor" | "admin";



export interface UserMe {
  id: string;
  email: string;
  phone: string | null;
  nickname: string;
  base_currency: string;
  /** IANA timezone; null = detect from browser. */
  timezone: string | null;
  /** Replayer stacks: raw chips or big blinds. */
  /** Replayer: hide opponent holes until showdown. */
  /** Hand input shell: wizard or table. */
  /** Playing-card suit colors: two-color or four-color. */
  role: UserRole;
  default_reminder_offsets: number[];
  email_verified: boolean;
  has_password: boolean;
  created_at: string;
}

export interface RequestCodePayload {
  email: string;
  captcha_token?: string;
}

export interface RequestCodeResponse {
  ok: boolean;
  expires_in_seconds: number;
  retry_after: number;
}

export interface RegisterStartPayload {
  email: string;
  privacy_consent: boolean;
  captcha_token?: string;
}

export interface RegisterVerifyPayload {
  email: string;
  code: string;
}

export interface RegisterVerifyResponse {
  registration_token: string;
  expires_in_seconds: number;
}

export interface RegisterCompletePayload {
  registration_token: string;
  password: string;
  nickname: string;
}

export interface LoginPasswordPayload {
  email: string;
  password: string;
}

export interface SetPasswordPayload {
  password: string;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}

export type BaseCurrencyCode = "RUB" | "USD" | "EUR" | "BYN";

export interface UpdateMePayload {
  nickname?: string;
  base_currency?: BaseCurrencyCode;
  /** IANA string, or null to reset to browser auto-detect. */
  timezone?: string | null;
  default_reminder_offsets?: number[];
}
