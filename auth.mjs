import {
  browserLocalPersistence,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "./firebase.mjs";
import { ensureDailyResetAutomation } from "./operationalreset.mjs";

const LOGIN_PAGE_PATH = "./login.html";
const HOME_PAGE_PATH = "./index.html";
let persistencePromise = null;
let authStatePromise = null;
let logoutDialog = null;
let logoutConfirmButton = null;
let lastLogoutTrigger = null;
let isLoggingOut = false;

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
  isLoggingOut = isBusy;

  document.querySelectorAll(".logout-button").forEach((button) => {
    button.disabled = isBusy;
    button.textContent = isBusy ? "Logging out..." : "Log out";
  });

  if (logoutConfirmButton) {
    logoutConfirmButton.disabled = isBusy;
    logoutConfirmButton.textContent = isBusy ? "Logging out..." : "Log out";
  }
}

function setLogoutDialogOpenState(isOpen) {
  if (!logoutDialog) {
    return;
  }

  logoutDialog.classList.toggle("alert-popup-visible", isOpen);
  document.body.classList.toggle("popup-open", isOpen);
}

function closeLogoutDialog() {
  if (!logoutDialog || isLoggingOut) {
    return;
  }

  setLogoutDialogOpenState(false);

  if (lastLogoutTrigger instanceof HTMLElement) {
    lastLogoutTrigger.focus();
  }
}

function ensureLogoutDialog() {
  if (logoutDialog) {
    return logoutDialog;
  }

  logoutDialog = document.createElement("div");
  logoutDialog.className = "alert-popup logout-confirm-popup";
  logoutDialog.innerHTML = `
    <div class="alert-popup-backdrop" data-logout-close></div>
    <div
      class="alert-popup-card logout-confirm-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="logoutConfirmTitle"
      aria-describedby="logoutConfirmCopy"
    >
      <div class="alert-popup-head logout-confirm-head">
        <div class="logout-confirm-title-group">
          <span class="alert-popup-eyebrow logout-confirm-eyebrow">Log Out</span>
          <h3 id="logoutConfirmTitle">Sign out of Cypher?</h3>
          <p class="alert-popup-copy logout-confirm-copy" id="logoutConfirmCopy">
            You will be returned to the login page and will need to sign in again to continue.
          </p>
        </div>
        <button
          class="alert-popup-close"
          type="button"
          aria-label="Close logout confirmation"
          data-logout-close
        >
          x
        </button>
      </div>
      <div class="logout-confirm-actions">
        <button type="button" class="logout-confirm-cancel" data-logout-close>
          Stay signed in
        </button>
        <button type="button" class="logout-confirm-submit" id="logoutConfirmBtn">
          Log out
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(logoutDialog);
  logoutConfirmButton = document.getElementById("logoutConfirmBtn");

  logoutDialog.addEventListener("click", (event) => {
    if (event.target.closest("[data-logout-close]")) {
      closeLogoutDialog();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      logoutDialog?.classList.contains("alert-popup-visible")
    ) {
      closeLogoutDialog();
    }
  });

  logoutConfirmButton.addEventListener("click", async () => {
    setLogoutButtonState(true);

    try {
      await signOut(auth);
      redirectTo(LOGIN_PAGE_PATH);
    } catch (error) {
      setLogoutButtonState(false);
    }
  });

  return logoutDialog;
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
  await ensureDailyResetAutomation({
    user,
    boxesCollectionPath: getBoxesCollectionPath(user),
    officesCollectionPath: getOfficesCollectionPath(user),
    activeWeeklyMovementsPath: getActiveWeeklyMovementsPath(user),
    dailyResetStatePath: getDailyResetStatePath(user),
  }).catch((error) => {
    console.error("Daily reset automation could not start.", error);
  });
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
  ensureLogoutDialog();

  document.querySelectorAll(".logout-button").forEach((button) => {
    if (button.dataset.authBound === "true") {
      return;
    }

    button.dataset.authBound = "true";
    button.addEventListener("click", () => {
      if (isLoggingOut) {
        return;
      }

      lastLogoutTrigger = button;
      setLogoutDialogOpenState(true);

      const cancelButton = logoutDialog?.querySelector(".logout-confirm-cancel");
      if (cancelButton instanceof HTMLElement) {
        cancelButton.focus();
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

function getWeeklyStatsCollectionPath(userOrUid) {
  return `${getUserRootPath(userOrUid)}/weeklyStats`;
}

function getActiveWeeklyMovementsPath(userOrUid) {
  return `${getUserRootPath(userOrUid)}/activeWeeklyMovements`;
}

function getDailyResetStatePath(userOrUid) {
  return `${getUserRootPath(userOrUid)}/system/dailyReset`;
}

export {
  getActiveWeeklyMovementsPath,
  getBoxesCollectionPath,
  getDailyResetStatePath,
  getOfficesCollectionPath,
  getRedirectTarget,
  getUserRootPath,
  getWeeklyStatsCollectionPath,
  initLogoutButton,
  redirectAuthenticatedUser,
  requestPasswordReset,
  requireAuth,
  signInWithEmail,
};
