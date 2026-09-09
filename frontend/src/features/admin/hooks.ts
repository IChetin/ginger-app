import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createAdminOrganizer,
  createAdminSeries,
  createAdminSeriesEvent,
  createAdminVenue,
  deleteAdminEvent,
  deleteAdminOrganizer,
  deleteAdminOrganizerLogo,
  deleteAdminSeries,
  deleteAdminVenue,
  duplicateAdminEvent,
  fetchAdminEvent,
  fetchAdminEventChanges,
  fetchAdminOrganizers,
  fetchAdminParsers,
  fetchAdminChangeLog,
  fetchAdminDashboard,
  fetchAdminSeries,
  fetchAdminSeriesChanges,
  fetchAdminSeriesDetail,
  fetchAdminSeriesEvents,
  fetchAdminUsers,
  fetchAdminVenues,
  previewAdminEvent,
  previewAdminFlights,
  previewAdminSeries,
  replaceAdminEventBlindLevels,
  replaceAdminEventFlights,
  updateAdminEvent,
  updateAdminOrganizer,
  updateAdminParser,
  updateAdminSeries,
  updateAdminUserRole,
  updateAdminVenue,
  uploadAdminOrganizerLogo,
  type AdminListParams,
  type AdminSeriesListParams,
  type AdminUsersListParams,
} from "@/features/admin/api";
import type { ChangeLogListParams } from "@/api/types/admin";
import { adminKeys } from "@/features/admin/queryKeys";
import {
  isAdminUser,
  isStaffUser,
  useLogin,
  useLogout,
  useMe,
  useRequestCode,
} from "@/features/auth/hooks";
import { authKeys } from "@/features/auth/queryKeys";
import { scheduleKeys } from "@/features/schedule/api/queryKeys";

export { isAdminUser, isStaffUser, useLogin, useLogout, useMe, useRequestCode };

function invalidateSchedule(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: scheduleKeys.all });
}

export function useUsersAdmin(
  params: AdminUsersListParams = { limit: 50, offset: 0 },
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: adminKeys.users(params),
    queryFn: () => fetchAdminUsers(params),
    enabled: options?.enabled ?? true,
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof updateAdminUserRole>[1] }) =>
      updateAdminUserRole(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.users() });
      await queryClient.invalidateQueries({ queryKey: authKeys.me() });
    },
  });
}

export function useVenuesAdmin(params: AdminListParams = { limit: 100, offset: 0 }) {
  return useQuery({
    queryKey: adminKeys.venues(params),
    queryFn: () => fetchAdminVenues(params),
  });
}

export function useOrganizersAdmin(params: AdminListParams = { limit: 100, offset: 0 }) {
  return useQuery({
    queryKey: adminKeys.organizers(params),
    queryFn: () => fetchAdminOrganizers(params),
  });
}

export function useAdminParsers() {
  return useQuery({
    queryKey: adminKeys.parsers(),
    queryFn: fetchAdminParsers,
  });
}

export function useUpdateParser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof updateAdminParser>[1] }) =>
      updateAdminParser(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.parsers() });
      await queryClient.invalidateQueries({ queryKey: adminKeys.organizers() });
    },
  });
}

export function useAdminDashboard() {
  return useQuery({
    queryKey: adminKeys.dashboard(),
    queryFn: fetchAdminDashboard,
    refetchInterval: 60_000,
  });
}

export function useAdminChangeLog(params: ChangeLogListParams = {}) {
  return useQuery({
    queryKey: adminKeys.changeLog(params),
    queryFn: () => fetchAdminChangeLog(params),
  });
}

export function useSeriesAdmin(params: AdminSeriesListParams = { limit: 100, offset: 0 }) {
  return useQuery({
    queryKey: adminKeys.series(params),
    queryFn: () => fetchAdminSeries(params),
  });
}

export function useSeriesDetailAdmin(seriesId: string) {
  return useQuery({
    queryKey: adminKeys.seriesDetail(seriesId),
    queryFn: () => fetchAdminSeriesDetail(seriesId),
    enabled: Boolean(seriesId),
  });
}

export function useSeriesEventsAdmin(seriesId: string) {
  return useQuery({
    queryKey: adminKeys.seriesEvents(seriesId),
    queryFn: () => fetchAdminSeriesEvents(seriesId),
    enabled: Boolean(seriesId),
  });
}

export function useSeriesChangesAdmin(seriesId: string, limit = 20) {
  return useQuery({
    queryKey: adminKeys.seriesChanges(seriesId, limit),
    queryFn: () => fetchAdminSeriesChanges(seriesId, { limit }),
    enabled: Boolean(seriesId),
  });
}

export function useEventAdmin(eventId: string) {
  return useQuery({
    queryKey: adminKeys.event(eventId),
    queryFn: () => fetchAdminEvent(eventId),
    enabled: Boolean(eventId),
  });
}

export function useEventChangesAdmin(eventId: string, limit = 50) {
  return useQuery({
    queryKey: adminKeys.eventChanges(eventId, limit),
    queryFn: () => fetchAdminEventChanges(eventId, { limit }),
    enabled: Boolean(eventId),
  });
}

export function useDuplicateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => duplicateAdminEvent(eventId),
    onSuccess: async (event) => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.seriesEvents(event.series_id) });
      await queryClient.invalidateQueries({ queryKey: adminKeys.seriesDetail(event.series_id) });
      await invalidateSchedule(queryClient);
    },
  });
}

export function useCreateVenue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createAdminVenue,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.venues() });
      await invalidateSchedule(queryClient);
    },
  });
}

export function useUpdateVenue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof updateAdminVenue>[1] }) =>
      updateAdminVenue(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.venues() });
      await invalidateSchedule(queryClient);
    },
  });
}

export function useDeleteVenue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAdminVenue,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.venues() });
      await invalidateSchedule(queryClient);
    },
  });
}

export function useCreateOrganizer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createAdminOrganizer,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.organizers() });
      await queryClient.invalidateQueries({ queryKey: adminKeys.parsers() });
      await invalidateSchedule(queryClient);
    },
  });
}

export function useUpdateOrganizer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof updateAdminOrganizer>[1] }) =>
      updateAdminOrganizer(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.organizers() });
      await queryClient.invalidateQueries({ queryKey: adminKeys.parsers() });
      await invalidateSchedule(queryClient);
    },
  });
}

export function useDeleteOrganizer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAdminOrganizer,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.organizers() });
      await invalidateSchedule(queryClient);
    },
  });
}

export function useUploadOrganizerLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => uploadAdminOrganizerLogo(id, file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.organizers() });
      await invalidateSchedule(queryClient);
    },
  });
}

export function useDeleteOrganizerLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAdminOrganizerLogo,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.organizers() });
      await invalidateSchedule(queryClient);
    },
  });
}

export function useCreateSeries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createAdminSeries,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.series() });
      await invalidateSchedule(queryClient);
    },
  });
}

export function useUpdateSeries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
      previewToken,
      notify,
    }: {
      id: string;
      body: Parameters<typeof updateAdminSeries>[1];
      previewToken?: string;
      notify?: boolean;
    }) => updateAdminSeries(id, body, previewToken, notify),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.series() });
      await queryClient.invalidateQueries({ queryKey: adminKeys.seriesDetail(variables.id) });
      await queryClient.invalidateQueries({ queryKey: adminKeys.seriesChanges(variables.id) });
      await invalidateSchedule(queryClient);
    },
  });
}

export function useDeleteSeries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAdminSeries,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.series() });
      await invalidateSchedule(queryClient);
    },
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      seriesId,
      body,
    }: {
      seriesId: string;
      body: Parameters<typeof createAdminSeriesEvent>[1];
    }) => createAdminSeriesEvent(seriesId, body),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.seriesEvents(variables.seriesId) });
      await queryClient.invalidateQueries({ queryKey: adminKeys.seriesDetail(variables.seriesId) });
      await queryClient.invalidateQueries({ queryKey: adminKeys.series() });
      await invalidateSchedule(queryClient);
    },
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
      previewToken,
      notify,
    }: {
      id: string;
      body: Parameters<typeof updateAdminEvent>[1];
      previewToken?: string;
      notify?: boolean;
    }) => updateAdminEvent(id, body, previewToken, notify),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.event(data.id) });
      await queryClient.invalidateQueries({ queryKey: adminKeys.eventChanges(data.id) });
      await queryClient.invalidateQueries({ queryKey: adminKeys.seriesEvents(data.series_id) });
      await queryClient.invalidateQueries({ queryKey: adminKeys.seriesChanges(data.series_id) });
      await queryClient.invalidateQueries({ queryKey: adminKeys.seriesDetail(data.series_id) });
      await invalidateSchedule(queryClient);
    },
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; seriesId: string }) => deleteAdminEvent(id),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.seriesEvents(variables.seriesId) });
      await queryClient.invalidateQueries({ queryKey: adminKeys.seriesDetail(variables.seriesId) });
      await invalidateSchedule(queryClient);
    },
  });
}

export function useReplaceFlights() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      eventId,
      items,
      previewToken,
      notify,
    }: {
      eventId: string;
      seriesId: string;
      items: Parameters<typeof replaceAdminEventFlights>[1];
      previewToken?: string;
      notify?: boolean;
    }) => replaceAdminEventFlights(eventId, items, previewToken, notify),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.event(variables.eventId) });
      await queryClient.invalidateQueries({ queryKey: adminKeys.eventChanges(variables.eventId) });
      await queryClient.invalidateQueries({ queryKey: adminKeys.seriesEvents(variables.seriesId) });
      await queryClient.invalidateQueries({
        queryKey: adminKeys.seriesChanges(variables.seriesId),
      });
      await invalidateSchedule(queryClient);
    },
  });
}

export function usePreviewAdminSeries() {
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof previewAdminSeries>[1] }) =>
      previewAdminSeries(id, body),
  });
}

export function usePreviewAdminEvent() {
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof previewAdminEvent>[1] }) =>
      previewAdminEvent(id, body),
  });
}

export function usePreviewAdminFlights() {
  return useMutation({
    mutationFn: ({
      eventId,
      items,
    }: {
      eventId: string;
      items: Parameters<typeof previewAdminFlights>[1];
    }) => previewAdminFlights(eventId, items),
  });
}

export function useReplaceBlindLevels() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      eventId,
      items,
    }: {
      eventId: string;
      seriesId: string;
      items: Parameters<typeof replaceAdminEventBlindLevels>[1];
    }) => replaceAdminEventBlindLevels(eventId, items),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.event(variables.eventId) });
      await queryClient.invalidateQueries({ queryKey: adminKeys.eventChanges(variables.eventId) });
      await invalidateSchedule(queryClient);
    },
  });
}
