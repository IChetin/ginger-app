export interface VapidPublicKeyResponse {
  public_key: string;
}

export interface PushSubscribePayload {
  endpoint: string;
  p256dh: string;
  auth: string;
  device_label?: string | null;
}

export interface PushUnsubscribePayload {
  endpoint: string;
}

export interface PushSubscription {
  id: string;
  endpoint: string;
  device_label: string | null;
  created_at: string;
  last_success_at: string | null;
}
