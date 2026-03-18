import {
  browserLocalPersistence,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "./firebase.mjs";

const LOGIN_PAGE_PATH = "./login.html";
const HOME_PAGE_PATH = "./index.html";
let persistencePromise = null;
let authStatePromise = null;

function pauseAfterRedirect() {
  return new Promise(() => {});
}

function ensureAuthPersistence() {
  if (!persistencePromise) {
    persistencePromise = setPersistence(auth, browserLocalPersistence).catch(
      (error) => {
        persistencePromise = null;
        throw error;
      }
    );
  }

  return persistencePromise;
}

function waitForInitialAuthState() {
  if (!authStatePromise) {
    authStatePromise = new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe();
        resolve(user);
      });
    });
  }

  return authStatePromise;
}

function sanitizeRedirectTarget(redirectTarget) {
  const fallbackTarget = HOME_PAGE_PATH;
  const normalizedTarget = String(redirectTarget || "").trim();

  if (!normalizedTarget) {
    return fallbackTarget;
  }

  if (
    normalizedTarget.startsWith("http://") ||
    normalizedTarget.startsWith("https://") ||
    normalizedTarget.startsWith("//")
  ) {
    return fallbackTarget;
  }

  if (!/^[a-zA-Z0-9._/-]+(?:\?.*)?(?:#.*)?$/.test(normalizedTarget)) {
    return fallbackTarget;
  }

  return normalizedTarget.startsWith("./")
    ? normalizedTarget
    : `./${normalizedTarget.replace(/^\/+/, "")}`;
}

function getCurrentPageTarget() {
  const currentPage =
    window.location.pathname.split("/").pop() || "index.html";
  return `${currentPage}${window.location.search}${window.location.hash}`;
}

function redirectTo(url) {
  window.location.replace(url);
}

function setLogoutButtonState(isBusy) {
  document.querySelectorAll(".logout-button").forEach((button) => {
    button.disabled = isBusy;
    button.textContent = isBusy ? "Logging out..." : "Log out";
  });
}

function getUserUid(userOrUid) {
  const uid = typeof userOrUid === "string" ? userOrUid : userOrUid?.uid;

  if (!uid) {
    throw new Error("A signed-in user is required.");
  }

  return uid;
}

function getRedirectTarget(fallbackTarget = HOME_PAGE_PATH) {
  const params = new URLSearchParams(window.location.search);
  const redirectTarget = params.get("redirect");
  return sanitizeRedirectTarget(redirectTarget || fallbackTarget);
}

async function requireAuth() {
  await ensureAuthPersistence();

  const user = await waitForInitialAuthState();
  if (!user) {
    const loginUrl = new URL(LOGIN_PAGE_PATH, window.location.href);
    loginUrl.searchParams.set("redirect", getCurrentPageTarget());
    redirectTo(loginUrl.toString());
    return pauseAfterRedirect();
  }

  initLogoutButton();
  return user;
}

async function redirectAuthenticatedUser() {
  await ensureAuthPersistence();

  const user = await waitForInitialAuthState();
  if (user) {
    redirectTo(getRedirectTarget());
    return pauseAfterRedirect();
  }

  return user;
}

async function signInWithEmail(email, password) {
  await ensureAuthPersistence();
  return signInWithEmailAndPassword(auth, email, password);
}

async function requestPasswordReset(email) {
  await ensureAuthPersistence();
  return sendPasswordResetEmail(auth, email);
}

function initLogoutButton() {
  document.querySelectorAll(".logout-button").forEach((button) => {
    if (button.dataset.authBound === "true") {
      return;
    }

    button.dataset.authBound = "true";
    button.addEventListener("click", async () => {
      setLogoutButtonState(true);

      try {
        await signOut(auth);
        redirectTo(LOGIN_PAGE_PATH);
      } catch (error) {
        console.error("Failed to sign out:", error);
        setLogoutButtonState(false);
      }
    });
  });
}

function getUserRootPath(userOrUid) {
  return `users/${getUserUid(userOrUid)}`;
}

function getBoxesCollectionPath(userOrUid) {
  return `${getUserRootPath(userOrUid)}/boxes`;
}

function getOfficesCollectionPath(userOrUid) {
  return `${getUserRootPath(userOrUid)}/offices`;
}

export {
  getBoxesCollectionPath,
  getOfficesCollectionPath,
  getRedirectTarget,
  getUserRootPath,
  initLogoutButton,
  redirectAuthenticatedUser,
  requestPasswordReset,
  requireAuth,
  signInWithEmail,
};
