import { useQuery } from "@tanstack/react-query";

import { fetchCurrencies } from "@/api/client";

/** Re-export auth hooks from `@/api/auth` for existing feature imports. */
export {
  isAdminUser,
  isStaffUser,
  useChangePassword,
  useLogin,
  useLogout,
  useMe,
  usePasswordLogin,
  useRegisterComplete,
  useRegisterStart,
  useRegisterVerify,
  useRequestCode,
  useSetPassword,
  useUpdateProfile,
} from "@/api/auth";

/** Справочник валют для выбора базовой валюты в профиле. Перенесён из трекера при его удалении. */
export function useCurrencies() {
  return useQuery({
    queryKey: ["currencies"],
    queryFn: fetchCurrencies,
    staleTime: 5 * 60_000,
  });
}
