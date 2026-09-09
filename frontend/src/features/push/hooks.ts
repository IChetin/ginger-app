import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getCurrentPushSubscription,
  isPushSupported,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} from "@/features/push/api";
import { pushKeys } from "@/features/push/queryKeys";
import { useMe } from "@/features/auth/hooks";

export function usePushSubscription(options?: { enabled?: boolean }) {
  const { data: user } = useMe();

  return useQuery({
    queryKey: pushKeys.subscription(),
    queryFn: getCurrentPushSubscription,
    enabled: Boolean(user) && isPushSupported() && (options?.enabled ?? true),
    staleTime: 30_000,
  });
}

export function useSubscribePush() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: subscribeToPushNotifications,
    onSuccess: async (subscription) => {
      queryClient.setQueryData(pushKeys.subscription(), subscription);
    },
  });
}

export function useUnsubscribePush() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: unsubscribeFromPushNotifications,
    onSuccess: async () => {
      queryClient.setQueryData(pushKeys.subscription(), null);
    },
  });
}

export { isPushSupported };
