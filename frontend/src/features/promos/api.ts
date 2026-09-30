import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createPromo,
  deletePromo,
  fetchAdminPromos,
  fetchPromos,
  promoFromImage,
  promoFromText,
  updatePromo,
  uploadPromoImage,
  type PromoPayload,
} from "@/features/promos/promosApi";

export type {
  Promo,
  PromoAdmin,
  PromoPayload,
  PromoPrize,
  PromoWindow,
} from "@/features/promos/promosApi";

const keys = {
  promos: ["promos"] as const,
  admin: ["admin", "promos"] as const,
};

/** Акции плашками — раздел PROMO; открыт и гостю. */
export function usePromos() {
  return useQuery({
    queryKey: keys.promos,
    queryFn: fetchPromos,
    // Акция кончается ровно в свой час — список освежаем, пока экран открыт.
    refetchInterval: 10 * 60_000,
  });
}

export function useAdminPromos() {
  return useQuery({ queryKey: keys.admin, queryFn: fetchAdminPromos });
}

function usePromoMutation<TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.admin });
      void queryClient.invalidateQueries({ queryKey: keys.promos });
    },
  });
}

export function useCreatePromo() {
  return usePromoMutation(createPromo);
}

export function useUpdatePromo() {
  return usePromoMutation(({ id, body }: { id: string; body: PromoPayload }) =>
    updatePromo(id, body),
  );
}

export function useDeletePromo() {
  return usePromoMutation(deletePromo);
}

export function usePromoFromText() {
  return usePromoMutation(promoFromText);
}

export function usePromoFromImage() {
  return usePromoMutation((file: File) => promoFromImage(file, file.name));
}

export function useUploadPromoImage() {
  return usePromoMutation(({ id, file }: { id: string; file: File }) =>
    uploadPromoImage(id, file, file.name),
  );
}
