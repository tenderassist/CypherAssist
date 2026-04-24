import {
  ref,
  get,
  runTransaction,
  update,
} from "firebase/database";
import { db } from "./firebase.mjs";
import { recordWeeklyCheckInActivity } from "./weeklystats.mjs";

const automationStateByUserId = new Map();
const RESET_LEASE_TIMEOUT_MS = 15 * 60 * 1000;
const RESET_RETRY_DELAY_MS = 5 * 60 * 1000;

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function getLocalDateKey(referenceDate = new Date()) {
  return `${referenceDate.getFullYear()}-${padNumber(
    referenceDate.getMonth() + 1
  )}-${padNumber(referenceDate.getDate())}`;
}

function createDateFromDateKey(dateKey) {
  const [year, month, day] = String(dateKey || "")
    .split("-")
    .map(Number);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getMillisecondsUntilNextMidnight(referenceDate = new Date()) {
  const nextMidnight = new Date(referenceDate);
  nextMidnight.setHours(24, 0, 0, 0);
  return Math.max(1000, nextMidnight.getTime() - referenceDate.getTime() + 1000);
}

function getScheduledResetMoment(previousResetDateKey, referenceDate = new Date()) {
  const previousResetDate = createDateFromDateKey(previousResetDateKey);

  if (!previousResetDate) {
    const fallbackMoment = new Date(referenceDate);
    fallbackMoment.setHours(0, 0, 0, 0);
    return fallbackMoment;
  }

  const scheduledResetMoment = new Date(previousResetDate);
  scheduledResetMoment.setDate(scheduledResetMoment.getDate() + 1);
  scheduledResetMoment.setHours(0, 0, 0, 0);

  return scheduledResetMoment.getTime() > referenceDate.getTime()
    ? new Date(referenceDate)
    : scheduledResetMoment;
}

function buildOperationalResetUpdates({
  boxesCollectionPath,
  officesCollectionPath,
  boxes = {},
  offices = {},
}) {
  const updates = {};
  const activeItemEntries = [];

  Object.keys(boxes || {}).forEach((boxId) => {
    const boxData = boxes[boxId] && typeof boxes[boxId] === "object" ? boxes[boxId] : {};
    const currentOffice = String(boxData.boxoffice || "");

    if (currentOffice && currentOffice.toLowerCase() !== "in safe") {
      activeItemEntries.push({
        boxId,
        boxData,
      });
    }

    updates[`${boxesCollectionPath}/${boxId}/boxhistory`] = "[]";
    updates[`${boxesCollectionPath}/${boxId}/boxoffice`] = "In Safe";
    updates[`${boxesCollectionPath}/${boxId}/boxtimeout`] = "";
    updates[`${boxesCollectionPath}/${boxId}/boxtimein`] = "";
    updates[`${boxesCollectionPath}/${boxId}/boxtempout`] = "";
    updates[`${boxesCollectionPath}/${boxId}/boxtempin`] = "";
    updates[`${boxesCollectionPath}/${boxId}/boxtimeoutAt`] = "";
    updates[`${boxesCollectionPath}/${boxId}/boxtimeoutDate`] = "";
    updates[`${boxesCollectionPath}/${boxId}/boxtimeoutDayLabel`] = "";
    updates[`${boxesCollectionPath}/${boxId}/boxtimeinAt`] = "";
    updates[`${boxesCollectionPath}/${boxId}/boxtimeinDate`] = "";
    updates[`${boxesCollectionPath}/${boxId}/boxtimeinDayLabel`] = "";
  });

  Object.keys(offices || {}).forEach((officeId) => {
    if (officeId === "officecurrent") return;

    updates[`${officesCollectionPath}/${officeId}/officehistory`] = "[]";
    updates[`${officesCollectionPath}/${officeId}/officecurrent`] = "[]";
  });

  return {
    updates,
    activeItemEntries,
  };
}

async function performOperationalDailyReset({
  user,
  boxesCollectionPath,
  officesCollectionPath,
  activeWeeklyMovementsPath,
  dailyResetStatePath,
  occurredAt = new Date(),
  completedDateKey = getLocalDateKey(occurredAt),
  processedAt = new Date(),
}) {
  const [boxesSnapshot, officesSnapshot] = await Promise.all([
    get(ref(db, boxesCollectionPath)),
    get(ref(db, officesCollectionPath)),
  ]);
  const dateKey = String(completedDateKey || getLocalDateKey(occurredAt));
  const resetTimestamp = processedAt.toISOString();
  const effectiveResetTimestamp = occurredAt.toISOString();
  const { updates, activeItemEntries } = buildOperationalResetUpdates({
    boxesCollectionPath,
    officesCollectionPath,
    boxes: boxesSnapshot.exists() ? boxesSnapshot.val() : {},
    offices: officesSnapshot.exists() ? officesSnapshot.val() : {},
  });

  if (activeItemEntries.length) {
    await recordWeeklyCheckInActivity({
      user,
      boxEntries: activeItemEntries,
      returnedBy: "Daily Reset",
      occurredAt,
    });
  }

  updates[`${dailyResetStatePath}/lastDailyResetDateKey`] = dateKey;
  updates[`${dailyResetStatePath}/lastDailyResetAt`] = resetTimestamp;
  updates[`${dailyResetStatePath}/lastDailyResetEffectiveAt`] = effectiveResetTimestamp;
  updates[`${dailyResetStatePath}/processingDateKey`] = "";
  updates[`${dailyResetStatePath}/processingStartedAt`] = "";
  updates[`${dailyResetStatePath}/processingLeaseId`] = "";
  if (activeWeeklyMovementsPath) {
    updates[activeWeeklyMovementsPath] = null;
  }

  await update(ref(db), updates);

  return {
    dateKey,
    resetTimestamp,
    effectiveResetTimestamp,
  };
}

async function claimDailyResetIfNeeded({
  dailyResetStatePath,
  todayDateKey,
  resetTimestamp,
}) {
  const leaseId = `${todayDateKey}-${Math.random().toString(36).slice(2)}`;
  const transactionResult = await runTransaction(ref(db, dailyResetStatePath), (currentValue) => {
    const currentState =
      currentValue && typeof currentValue === "object" ? currentValue : {};
    const lastDailyResetDateKey = String(currentState.lastDailyResetDateKey || "");
    const processingDateKey = String(currentState.processingDateKey || "");
    const processingStartedAt = new Date(currentState.processingStartedAt || 0);
    const processingAgeMs = Number.isNaN(processingStartedAt.getTime())
      ? Number.POSITIVE_INFINITY
      : Date.now() - processingStartedAt.getTime();

    if (!lastDailyResetDateKey) {
      return {
        ...currentState,
        lastDailyResetDateKey: todayDateKey,
        lastDailyResetAt: resetTimestamp,
        processingDateKey: "",
        processingStartedAt: "",
        processingLeaseId: "",
      };
    }

    if (lastDailyResetDateKey === todayDateKey) {
      return;
    }

    if (
      processingDateKey === todayDateKey &&
      processingAgeMs < RESET_LEASE_TIMEOUT_MS
    ) {
      return;
    }

    return {
      ...currentState,
      processingDateKey: todayDateKey,
      processingStartedAt: resetTimestamp,
      processingLeaseId: leaseId,
    };
  });

  const nextState =
    transactionResult.snapshot.exists() &&
    transactionResult.snapshot.val() &&
    typeof transactionResult.snapshot.val() === "object"
      ? transactionResult.snapshot.val()
      : {};
  const nextProcessingStartedAtMs = new Date(
    String(nextState.processingStartedAt || 0)
  ).getTime();
  const nextProcessingAgeMs = Number.isNaN(nextProcessingStartedAtMs)
    ? Number.POSITIVE_INFINITY
    : Date.now() - nextProcessingStartedAtMs;

  if (!transactionResult.committed) {
    return {
      initialized: false,
      claimed: false,
      leaseId: "",
      previousResetDateKey: String(nextState.lastDailyResetDateKey || ""),
      retryDelayMs:
        String(nextState.lastDailyResetDateKey || "") !== todayDateKey &&
        String(nextState.processingDateKey || "") === todayDateKey
          ? Math.max(
              1000,
              Math.min(
                RESET_RETRY_DELAY_MS,
                RESET_LEASE_TIMEOUT_MS - Math.max(0, nextProcessingAgeMs)
              )
            )
          : 0,
    };
  }

  if (
    String(nextState.lastDailyResetDateKey || "") === todayDateKey &&
    String(nextState.processingLeaseId || "") !== leaseId
  ) {
    return {
      initialized: true,
      claimed: false,
      leaseId: "",
      previousResetDateKey: String(nextState.lastDailyResetDateKey || ""),
      retryDelayMs: 0,
    };
  }

  return {
    initialized: false,
    claimed: String(nextState.processingLeaseId || "") === leaseId,
    leaseId,
    previousResetDateKey: String(nextState.lastDailyResetDateKey || ""),
    retryDelayMs: 0,
  };
}

async function releaseDailyResetClaim(dailyResetStatePath) {
  await update(ref(db), {
    [`${dailyResetStatePath}/processingDateKey`]: "",
    [`${dailyResetStatePath}/processingStartedAt`]: "",
    [`${dailyResetStatePath}/processingLeaseId`]: "",
  });
}

async function runDailyResetCheck(options) {
  const {
    dailyResetStatePath,
  } = options;
  const now = new Date();
  const todayDateKey = getLocalDateKey(now);
  const resetClaim = await claimDailyResetIfNeeded({
    dailyResetStatePath,
    todayDateKey,
    resetTimestamp: now.toISOString(),
  });

  if (resetClaim.initialized) {
    return { initialized: true, resetPerformed: false, retryDelayMs: 0 };
  }

  if (!resetClaim.claimed) {
    return {
      initialized: false,
      resetPerformed: false,
      retryDelayMs: Math.max(0, Number(resetClaim.retryDelayMs) || 0),
    };
  }

  const resetOccurredAt = getScheduledResetMoment(
    resetClaim.previousResetDateKey,
    now
  );

  try {
    await performOperationalDailyReset({
      ...options,
      occurredAt: resetOccurredAt,
      completedDateKey: todayDateKey,
      processedAt: now,
    });
  } catch (error) {
    await releaseDailyResetClaim(dailyResetStatePath);
    throw error;
  }

  return { initialized: false, resetPerformed: true, retryDelayMs: 0 };
}

function scheduleNextDailyResetCheck(
  userId,
  options,
  delayMs = getMillisecondsUntilNextMidnight()
) {
  const automationState = automationStateByUserId.get(userId);
  if (!automationState) return;

  if (automationState.timerId) {
    window.clearTimeout(automationState.timerId);
  }

  automationState.timerId = window.setTimeout(async () => {
    let nextDelayMs = getMillisecondsUntilNextMidnight();

    try {
      const resetResult = await runDailyResetCheck(options);
      if (resetResult?.retryDelayMs) {
        nextDelayMs = Math.min(resetResult.retryDelayMs, nextDelayMs);
      }
    } catch (error) {
      console.error("Daily reset check failed.", error);
      nextDelayMs = Math.min(RESET_RETRY_DELAY_MS, nextDelayMs);
    } finally {
      scheduleNextDailyResetCheck(userId, options, nextDelayMs);
    }
  }, Math.max(1000, delayMs));
}

async function ensureDailyResetAutomation(options) {
  const userId = options?.user?.uid || options?.user;
  if (!userId) {
    throw new Error("A signed-in user is required for daily reset automation.");
  }

  let automationState = automationStateByUserId.get(userId);
  if (!automationState) {
    automationState = {
      initPromise: null,
      timerId: null,
    };
    automationStateByUserId.set(userId, automationState);
  }

  if (!automationState.initPromise) {
    automationState.initPromise = (async () => {
      let nextDelayMs = getMillisecondsUntilNextMidnight();

      try {
        const resetResult = await runDailyResetCheck(options);
        if (resetResult?.retryDelayMs) {
          nextDelayMs = Math.min(resetResult.retryDelayMs, nextDelayMs);
        }
      } catch (error) {
        nextDelayMs = Math.min(RESET_RETRY_DELAY_MS, nextDelayMs);
        throw error;
      } finally {
        scheduleNextDailyResetCheck(userId, options, nextDelayMs);
      }
    })().catch((error) => {
      automationState.initPromise = null;
      throw error;
    });
  }

  return automationState.initPromise;
}

export {
  ensureDailyResetAutomation,
  performOperationalDailyReset,
};
