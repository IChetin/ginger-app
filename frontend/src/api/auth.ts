import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ApiError,
  changePassword,
  fetchCurrentUser,
  loginWithPassword,
  logoutAuth,
  registerComplete,
  registerStart,
  registerVerify,
  requestAuthCode,
  setPassword,
  updateCurrentUser,
  verifyAuthCode,
} from "@/api/client";
import type {
  ChangePasswordPayload,
  LoginPasswordPayload,
  RegisterCompletePayload,
  RegisterStartPayload,
  RegisterVerifyPayload,
  SetPasswordPayload,
  UpdateMePayload,
  UserMe,
} from "@/api/types/auth";
import { authKeys } from "@/features/auth/queryKeys";

export { authKeys };
export { fetchCurrentUser, requestAuthCode, verifyAuthCode, logoutAuth, loginWithPassword };

async function afterAuthSuccess(queryClient: ReturnType<typeof useQueryClient>, user: UserMe) {
  queryClient.setQueryData(authKeys.me(), user);
  await queryClient.invalidateQueries({ queryKey: authKeys.me() });
}

function isUnauthorized(error: unknown): boolean {
  if (error instanceof ApiError && error.status === 401) {
    return true;
  }
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status: unknown }).status === 401
  );
}

export function useMe(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: authKeys.me(),
    queryFn: async (): Promise<UserMe | null> => {
      try {
        return await fetchCurrentUser();
      } catch (error) {
        // Guest is a valid outcome — do not leave the query pending/retrying on 401.
        if (isUnauthorized(error)) {
          return null;
        }
        throw error;
      }
    },
    retry: (failureCount, error) => {
      if (isUnauthorized(error)) {
        return false;
      }
      return failureCount < 1;
    },
    staleTime: 60_000,
    ...options,
  });
}

export function isStaffUser(user: UserMe | null | undefined): user is UserMe {
  return user?.role === "admin" || user?.role === "editor";
}

export function isAdminUser(user: UserMe | null | undefined): boolean {
  return user?.role === "admin";
}

export function useRequestCode() {
  return useMutation({
    mutationFn: ({ email, captchaToken }: { email: string; captchaToken?: string }) =>
      requestAuthCode(email, captchaToken),
  });
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ email, code }: { email: string; code: string }) => verifyAuthCode(email, code),
    onSuccess: async (user) => {
      await afterAuthSuccess(queryClient, user);
    },
  });
}

export function usePasswordLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: LoginPasswordPayload) => loginWithPassword(body),
    onSuccess: async (user) => {
      await afterAuthSuccess(queryClient, user);
    },
  });
}

export function useRegisterStart() {
  return useMutation({
    mutationFn: (body: RegisterStartPayload) => registerStart(body),
  });
}

export function useRegisterVerify() {
  return useMutation({
    mutationFn: (body: RegisterVerifyPayload) => registerVerify(body),
  });
}

export function useRegisterComplete() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: RegisterCompletePayload) => registerComplete(body),
    onSuccess: async (user) => {
      await afterAuthSuccess(queryClient, user);
    },
  });
}

export function useSetPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SetPasswordPayload) => setPassword(body),
    onSuccess: (user) => {
      queryClient.setQueryData(authKeys.me(), user);
    },
  });
}

export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ChangePasswordPayload) => changePassword(body),
    onSuccess: (user) => {
      queryClient.setQueryData(authKeys.me(), user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logoutAuth,
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateMePayload) => updateCurrentUser(body),
    onSuccess: (user) => {
      queryClient.setQueryData(authKeys.me(), user);
    },
  });
}
