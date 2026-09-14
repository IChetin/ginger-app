import { BrowserRouter, Route, Routes } from "react-router-dom";

import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import { AppShell } from "@/components/layout/AppShell";
import { AdminGuard } from "@/features/admin/AdminGuard";
import { AdminRoleGuard } from "@/features/admin/AdminRoleGuard";
import { LoginPage as AdminLoginPage } from "@/features/admin/LoginPage";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { ProfilePage } from "@/features/auth/ProfilePage";
import { AdminChipRequestPage } from "@/pages/admin/AdminChipRequestPage";
import { AdminChipRequestsPage } from "@/pages/admin/AdminChipRequestsPage";
import { AdminDashboardPage } from "@/pages/admin/AdminDashboardPage";
import { AdminGridImportPage } from "@/pages/admin/AdminGridImportPage";
import { AdminInvitesPage } from "@/pages/admin/AdminInvitesPage";
import { AdminLayout } from "@/pages/admin/AdminLayout";
import { AdminOrganizersPage } from "@/pages/admin/AdminOrganizersPage";
import { AdminPlayersPage } from "@/pages/admin/AdminPlayersPage";
import { AdminRequisitesPage } from "@/pages/admin/AdminRequisitesPage";
import { AdminThreadPage } from "@/pages/admin/AdminThreadPage";
import { AdminThreadsPage } from "@/pages/admin/AdminThreadsPage";
import { AdminUsersPage } from "@/pages/admin/AdminUsersPage";
import { ChipAccountsPage } from "@/pages/ChipAccountsPage";
import { ChipRequestPage } from "@/pages/ChipRequestPage";
import { ChipsPage } from "@/pages/ChipsPage";
import { ClubsPage } from "@/pages/ClubsPage";
import { DialogsPage } from "@/pages/DialogsPage";
import { MorePage } from "@/pages/MorePage";
import { OfflinePage } from "@/pages/OfflinePage";
import { PlayerHomePage } from "@/pages/PlayerHomePage";
import { listenInstallPrompt } from "@/features/onboarding/platform";
import { InvitePage } from "@/pages/InvitePage";
import { OnboardingPage } from "@/pages/OnboardingPage";
import { ReferralPage } from "@/pages/ReferralPage";
import { TournamentsPage } from "@/pages/TournamentsPage";
import { ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from "@/pages/AuthLegacyRedirect";
import { InstallPage } from "@/pages/InstallPage";
import { LoginPage } from "@/pages/LoginPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { PrivacyPage } from "@/pages/PrivacyPage";
import { RegisterPage } from "@/pages/RegisterPage";

// Android присылает предложение установки рано — ловим его до экрана установки.
listenInstallPrompt();

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        {/* Расписание — витрина клуба, открыто без входа. */}
        <Route path="/tournaments" element={<TournamentsPage />} />
        <Route element={<AuthGuard />}>
          <Route path="/" element={<PlayerHomePage />} />
          <Route path="/more" element={<MorePage />} />
          <Route path="/clubs" element={<ClubsPage />} />
          <Route path="/offline" element={<OfflinePage />} />
          <Route path="/dialogs/*" element={<DialogsPage />} />
          <Route path="/chips" element={<ChipsPage />} />
          <Route path="/chips/accounts" element={<ChipAccountsPage />} />
          <Route path="/chips/:requestId" element={<ChipRequestPage />} />
          <Route path="/referral" element={<ReferralPage />} />
          <Route path="/welcome" element={<OnboardingPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
      </Route>

      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route path="/r/:token" element={<InvitePage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/install" element={<InstallPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin" element={<AdminGuard />}>
        <Route element={<AdminLayout />}>
          <Route index element={<AdminDashboardPage />} />
          <Route path="organizers" element={<AdminOrganizersPage />} />
          <Route element={<AdminRoleGuard />}>
            <Route path="users" element={<AdminUsersPage />} />
          </Route>
          <Route path="grids" element={<AdminGridImportPage />} />
          <Route path="chips" element={<AdminChipRequestsPage />} />
          <Route path="chips/:requestId" element={<AdminChipRequestPage />} />
          <Route path="players" element={<AdminPlayersPage />} />
          <Route path="invites" element={<AdminInvitesPage />} />
          <Route path="requisites" element={<AdminRequisitesPage />} />
          <Route path="threads" element={<AdminThreadsPage />} />
          <Route path="threads/:threadId" element={<AdminThreadPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ConfirmProvider>
        <AppRoutes />
      </ConfirmProvider>
    </BrowserRouter>
  );
}
