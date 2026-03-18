import {
  getRedirectTarget,
  redirectAuthenticatedUser,
  requestPasswordReset,
  signInWithEmail,
} from "./auth.mjs";

const form = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const forgotPasswordButton = document.getElementById("forgotPasswordButton");
const feedback = document.getElementById("feedback");
const submitButton = document.getElementById("loginSubmit");
const togglePasswordButton = document.getElementById("togglePassword");
const passwordToggleText = document.querySelector(".password-toggle-text");

await redirectAuthenticatedUser();

function setFeedback(message, options = {}) {
  if (!feedback) return;

  const { error = false, success = false } = options;
  feedback.textContent = message;
  feedback.classList.toggle("error", error);
  feedback.classList.toggle("success", success);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getAuthErrorMessage(error) {
  switch (error?.code) {
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Incorrect email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    default:
      return "Could not sign in right now. Please try again.";
  }
}

function getPasswordResetMessage(error) {
  switch (error?.code) {
    case "auth/invalid-email":
      return "Enter a valid email address to reset the password.";
    case "auth/user-not-found":
      return "No account was found for that email address.";
    case "auth/too-many-requests":
      return "Too many reset attempts. Please wait a moment and try again.";
    default:
      return "Could not send the password reset email right now.";
  }
}

function setButtonBusy(button, isBusy, idleText, busyText) {
  if (!button) return;

  button.disabled = isBusy;
  button.textContent = isBusy ? busyText : idleText;
}

function handlePasswordToggle() {
  if (!passwordInput || !togglePasswordButton || !passwordToggleText) return;

  const showingPassword = passwordInput.type === "text";
  passwordInput.type = showingPassword ? "password" : "text";
  togglePasswordButton.setAttribute(
    "aria-label",
    showingPassword ? "Show password" : "Hide password"
  );
  togglePasswordButton.setAttribute(
    "aria-pressed",
    String(!showingPassword)
  );
  passwordToggleText.textContent = showingPassword ? "Show" : "Hide";
}

if (togglePasswordButton) {
  togglePasswordButton.addEventListener("click", handlePasswordToggle);
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = emailInput?.value.trim() || "";
    const password = passwordInput?.value || "";

    if (!email && !password) {
      setFeedback("Please enter your email and password.", { error: true });
      return;
    }

    if (!isValidEmail(email)) {
      setFeedback("Enter a valid email address.", { error: true });
      return;
    }

    if (!password) {
      setFeedback("Enter your password.", { error: true });
      return;
    }

    setFeedback("Signing in...");
    setButtonBusy(submitButton, true, "Sign in", "Signing in...");

    try {
      await signInWithEmail(email, password);
      setFeedback("Signed in. Redirecting...", { success: true });
      window.location.replace(getRedirectTarget("./index.html"));
    } catch (error) {
      console.error("Sign-in failed:", error);
      setFeedback(getAuthErrorMessage(error), { error: true });
    } finally {
      setButtonBusy(submitButton, false, "Sign in", "Signing in...");
    }
  });
}

if (forgotPasswordButton) {
  forgotPasswordButton.addEventListener("click", async (event) => {
    event.preventDefault();

    const email = emailInput?.value.trim() || "";

    if (!isValidEmail(email)) {
      setFeedback("Enter your email address first to reset the password.", {
        error: true,
      });
      emailInput?.focus();
      return;
    }

    setFeedback("Sending password reset email...");
    forgotPasswordButton.textContent = "Sending...";
    forgotPasswordButton.style.pointerEvents = "none";
    forgotPasswordButton.setAttribute("aria-disabled", "true");

    try {
      await requestPasswordReset(email);
      setFeedback(`Password reset email sent to ${email}.`, {
        success: true,
      });
    } catch (error) {
      console.error("Password reset failed:", error);
      setFeedback(getPasswordResetMessage(error), { error: true });
    } finally {
      forgotPasswordButton.textContent = "Forgot password?";
      forgotPasswordButton.style.pointerEvents = "";
      forgotPasswordButton.removeAttribute("aria-disabled");
    }
  });
}
