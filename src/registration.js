export function validateRegistration({ email, password, confirmation }) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return "Enter a valid email address.";
  if (password.length < 12)
    return "Use a password with at least 12 characters.";
  if (password !== confirmation) return "The passwords do not match.";
  return null;
}
export function registrationError(error) {
  if (
    error?.status === 429 ||
    error?.code === "over_email_send_rate_limit" ||
    error?.code === "over_request_rate_limit"
  )
    return "Too many attempts. Please wait a few minutes and try again.";
  if (
    error?.code === "user_already_exists" ||
    error?.message?.includes("already registered")
  )
    return "If you already have an account, sign in or use password recovery.";
  if (
    error?.code === "email_address_not_authorized" ||
    error?.code === "unexpected_failure" ||
    error?.message?.toLowerCase().includes("email")
  )
    return "The confirmation email could not be sent. Your account has not been activated. Contact the administrator.";
  return "Could not create the account. Please try again or contact the administrator.";
}
