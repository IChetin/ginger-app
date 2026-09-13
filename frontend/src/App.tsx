import { BrowserRouter, Route, Routes } from "react-router-dom";

import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import { DemoProvider } from "@/demo/DemoProvider";
import { AppShell } from "@/components/layout/AppShell";
import { AdminGuard } from "@/features/admin/AdminGuard";
import { AdminRoleGuard } from "@/features/admin/AdminRoleGuard";
import { BulkImportPage } from "@/features/admin/bulk-import/BulkImportPage";
import { BulkImportReviewPage } from "@/features/admin/bulk-import/BulkImportReviewPage";
import { ImportListPage } from "@/features/admin/import/ImportListPage";
import { ImportReviewPage } from "@/features/admin/import/ImportReviewPage";
import { LoginPage as AdminLoginPage } from "@/features/admin/LoginPage";
import { BookmarksPage } from "@/features/bookmarks/BookmarksPage";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { ProfilePage } from "@/features/auth/ProfilePage";
import { AdminChangeLogPage } from "@/pages/admin/AdminChangeLogPage";
import { AdminDashboardPage } from "@/pages/admin/AdminDashboardPage";
import { AdminEventDetailPage } from "@/pages/admin/AdminEventDetailPage";
import { AdminGridImportPage } from "@/pages/admin/AdminGridImportPage";
import { AdminLayout } from "@/pages/admin/AdminLayout";
import { AdminOrganizersPage } from "@/pages/admin/AdminOrganizersPage";
import { AdminParsersPage } from "@/pages/admin/AdminParsersPage";
import { AdminSeriesDetailPage } from "@/pages/admin/AdminSeriesDetailPage";
import { AdminSeriesPage } from "@/pages/admin/AdminSeriesPage";
import { AdminUsersPage } from "@/pages/admin/AdminUsersPage";
import { AdminVenuesPage } from "@/pages/admin/AdminVenuesPage";
import { CalendarPage } from "@/pages/CalendarPage";
import { TournamentsPage } from "@/pages/TournamentsPage";
import { EventPage } from "@/pages/EventPage";
import { ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from "@/pages/AuthLegacyRedirect";
import { HomePage } from "@/pages/HomePage";
import { InstallPage } from "@/pages/InstallPage";
import { LoginPage } from "@/pages/LoginPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { NotificationsPage } from "@/pages/NotificationsPage";
import { PrivacyPage } from "@/pages/PrivacyPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { SearchPage } from "@/pages/SearchPage";
import { SeriesPage } from "@/pages/SeriesPage";
import { SeriesSchedulePage } from "@/pages/SeriesSchedulePage";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/series/:seriesId" element={<SeriesPage />} />
        <Route path="/series/:seriesId/schedule" element={<SeriesSchedulePage />} />
        <Route path="/events/:eventId" element={<EventPage />} />
        <Route path="/bookmarks" element={<BookmarksPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route element={<AuthGuard />}>
          <Route path="/tournaments" element={<TournamentsPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
      </Route>

      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/install" element={<InstallPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin" element={<AdminGuard />}>
        <Route element={<AdminLayout />}>
          <Route index element={<AdminDashboardPage />} />
          <Route path="venues" element={<AdminVenuesPage />} />
          <Route path="organizers" element={<AdminOrganizersPage />} />
          <Route path="parsers" element={<AdminParsersPage />} />
          <Route path="change-log" element={<AdminChangeLogPage />} />
          <Route element={<AdminRoleGuard />}>
            <Route path="users" element={<AdminUsersPage />} />
          </Route>
          <Route path="series" element={<AdminSeriesPage />} />
          <Route path="series/:id" element={<AdminSeriesDetailPage />} />
          <Route path="events/:id" element={<AdminEventDetailPage />} />
          <Route path="grids" element={<AdminGridImportPage />} />
          <Route path="import" element={<ImportListPage />} />
          <Route path="import/bulk" element={<BulkImportPage />} />
          <Route path="import/bulk/:jobId" element={<BulkImportReviewPage />} />
          <Route path="import/:jobId" element={<ImportReviewPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <DemoProvider>
        <ConfirmProvider>
          <AppRoutes />
        </ConfirmProvider>
      </DemoProvider>
    </BrowserRouter>
  );
}
