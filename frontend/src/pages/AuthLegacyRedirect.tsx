import { Navigate } from "react-router-dom";

/** Legacy link-based flows removed — use /login (OTP) or /register. */
export function ForgotPasswordPage() {
  return <Navigate to="/login" replace />;
}

export function ResetPasswordPage() {
  return <Navigate to="/login" replace />;
}

export function VerifyEmailPage() {
  return <Navigate to="/login" replace />;
}
