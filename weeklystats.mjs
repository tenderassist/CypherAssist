import {
  ref,
  get,
  update,
} from "firebase/database";
import { db } from "./firebase.mjs";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function getUserUid(userOrUid) {
  const uid = typeof userOrUid === "string" ? userOrUid : userOrUid?.uid;

  if (!uid) {
    throw new Error("A signed-in user is required.");
  }

  return uid;
}

function getUserRootPath(userOrUid) {
  return `users/${getUserUid(userOrUid)}`;
}

function getWeeklyStatsCollectionPath(userOrUid) {
  return `${getUserRootPath(userOrUid)}/weeklyStats`;
}

function getActiveWeeklyMovementsPath(userOrUid) {
  return `${getUserRootPath(userOrUid)}/activeWeeklyMovements`;
}

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function sanitizeKeySegment(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || "na";
}

function addDays(referenceDate, amount) {
  const nextDate = new Date(referenceDate);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
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

function getLocalDateKey(referenceDate = new Date()) {
  return `${referenceDate.getFullYear()}-${padNumber(
    referenceDate.getMonth() + 1
  )}-${padNumber(referenceDate.getDate())}`;
}

function formatDisplayDate(referenceDate) {
  const date =
    referenceDate instanceof Date
      ? new Date(referenceDate)
      : createDateFromDateKey(referenceDate);

  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }

  return `${padNumber(date.getDate())}/${padNumber(
    date.getMonth() + 1
  )}/${date.getFullYear()}`;
}

function buildDayLabel(referenceDate) {
  const date =
    referenceDate instanceof Date
      ? new Date(referenceDate)
      : createDateFromDateKey(referenceDate);

  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }

  return `${DAY_NAMES[date.getDay()]} - ${formatDisplayDate(date)}`;
}

function getWeekStartDate(referenceDate = new Date()) {
  const weekStart = new Date(referenceDate);
  weekStart.setHours(0, 0, 0, 0);

  const dayOfWeek = weekStart.getDay();
  const difference = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  weekStart.setDate(weekStart.getDate() + difference);

  return weekStart;
}

function createWeekContext(referenceDate = new Date()) {
  const weekStart = getWeekStartDate(referenceDate);
  const weekEnd = addDays(weekStart, 4);

  const days = Array.from({ length: 5 }, (_, index) => {
    const date = addDays(weekStart, index);
    return {
      dateKey: getLocalDateKey(date),
      dayName: DAY_NAMES[date.getDay()],
      displayDate: formatDisplayDate(date),
      dayLabel: buildDayLabel(date),
    };
  });

  return {
    weekKey: getLocalDateKey(weekStart),
    weekStartDateKey: getLocalDateKey(weekStart),
    weekEndDateKey: getLocalDateKey(weekEnd),
    weekLabel: `${formatDisplayDate(weekStart)} - ${formatDisplayDate(weekEnd)}`,
    weekStartDayLabel: buildDayLabel(weekStart),
    days,
  };
}

function createDayContext(referenceDate = new Date()) {
  const dayDate = new Date(referenceDate);

  return {
    dateKey: getLocalDateKey(dayDate),
    dayName: DAY_NAMES[dayDate.getDay()],
    displayDate: formatDisplayDate(dayDate),
    dayLabel: buildDayLabel(dayDate),
    timeLabel: `${padNumber(dayDate.getHours())}:${padNumber(
      dayDate.getMinutes()
    )}`,
    isoStamp: dayDate.toISOString(),
    timestampMs: dayDate.getTime(),
    week: createWeekContext(dayDate),
  };
}

function isInSafeOffice(value) {
  return String(value || "").trim().toLowerCase() === "in safe";
}

function createDateFromDateKeyAndTimeLabel(dateKey, timeLabel = "") {
  const date = createDateFromDateKey(dateKey);
  if (!date) {
    return null;
  }

  const [hours, minutes] = String(timeLabel || "")
    .split(":")
    .map(Number);

  if (
    Number.isInteger(hours) &&
    Number.isInteger(minutes) &&
    hours >= 0 &&
    hours < 24 &&
    minutes >= 0 &&
    minutes < 60
  ) {
    date.setHours(hours, minutes, 0, 0);
  }

  return date;
}

function toSafeCount(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= 0
    ? Math.floor(numericValue)
    : 0;
}

function normalizeMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return { ...value };
}

function normalizeUniqueBoxes(value) {
  const normalized = normalizeMap(value);

  return Object.fromEntries(
    Object.entries(normalized)
      .filter(([, flag]) => Boolean(flag))
      .map(([boxId]) => [String(boxId), true])
  );
}

function normalizeDaySummary(value, dayContext = null) {
  const current = value && typeof value === "object" ? value : {};

  return {
    dateKey: dayContext?.dateKey || String(current.dateKey || ""),
    dayName: dayContext?.dayName || String(current.dayName || ""),
    displayDate: dayContext?.displayDate || String(current.displayDate || ""),
    label: dayContext?.dayLabel || String(current.label || ""),
    checkoutCount: toSafeCount(current.checkoutCount),
    returnCount: toSafeCount(current.returnCount),
    movementCount: toSafeCount(
      current.movementCount ??
        toSafeCount(current.checkoutCount) + toSafeCount(current.returnCount)
    ),
    uniqueBoxes: normalizeUniqueBoxes(current.uniqueBoxes),
    journeys: normalizeMap(current.journeys),
    returns: normalizeMap(current.returns),
    createdAt: String(current.createdAt || dayContext?.isoStamp || ""),
    lastUpdatedAt: String(current.lastUpdatedAt || dayContext?.isoStamp || ""),
  };
}

function formatDurationMinutes(totalMinutes) {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) {
    return "Unavailable";
  }

  const roundedMinutes = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;

  if (!hours) {
    return `${minutes} min`;
  }

  if (!minutes) {
    return `${hours} hr`;
  }

  return `${hours} hr ${minutes} min`;
}

function calculateDurationMinutes(startIso, endIso = new Date().toISOString()) {
  const startDate = new Date(startIso);
  const endDate = new Date(endIso);

  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    endDate.getTime() < startDate.getTime()
  ) {
    return null;
  }

  return Math.floor((endDate.getTime() - startDate.getTime()) / 60000);
}

function buildEventId(prefix, boxId, target, timestampMs, index = 0) {
  return [
    sanitizeKeySegment(prefix),
    Number(timestampMs || Date.now()).toString(36),
    Number(index || 0).toString(36),
    sanitizeKeySegment(boxId),
    sanitizeKeySegment(target),
  ].join("-");
}

function buildOperationalJourneySeed(boxId, boxData) {
  const current = boxData && typeof boxData === "object" ? boxData : {};
  const office = String(current.boxoffice || "").trim();

  if (!office || isInSafeOffice(office)) {
    return null;
  }

  const checkoutDateFromIso = new Date(String(current.boxtimeoutAt || ""));
  const checkoutDate = Number.isNaN(checkoutDateFromIso.getTime())
    ? createDateFromDateKeyAndTimeLabel(current.boxtimeoutDate, current.boxtimeout)
    : checkoutDateFromIso;

  if (!(checkoutDate instanceof Date) || Number.isNaN(checkoutDate.getTime())) {
    return null;
  }

  const checkoutDayContext = createDayContext(checkoutDate);
  const eventId = buildEventId(
    "journey",
    boxId,
    office,
    checkoutDayContext.timestampMs,
    0
  );

  return {
    eventId,
    weekKey: checkoutDayContext.week.weekKey,
    dateKey: checkoutDayContext.dateKey,
    dayContext: checkoutDayContext,
    journey: {
      eventId,
      boxId,
      office,
      officeLabel: `Office ${office}`,
      checkedOutAt: String(current.boxtimeoutAt || checkoutDayContext.isoStamp),
      checkedOutLabel: String(current.boxtimeout || checkoutDayContext.timeLabel),
      checkedOutBy: String(current.boxtempout || "Not recorded"),
      checkedOutDateKey: String(
        current.boxtimeoutDate || checkoutDayContext.dateKey
      ),
      checkedOutDayLabel: String(
        current.boxtimeoutDayLabel || checkoutDayContext.dayLabel
      ),
      returnedAt: "",
      returnedLabel: "",
      returnedBy: "",
      returnDateKey: "",
      returnDayLabel: "",
      returnedTo: "",
      durationMinutes: null,
      durationLabel: "In progress",
      status: "In progress",
    },
  };
}

function findMatchingOpenJourney(dayData, journeySeed) {
  return Object.values(normalizeMap(dayData?.journeys)).find((journey) => {
    return (
      String(journey?.boxId || "") === String(journeySeed.boxId || "") &&
      String(journey?.office || "") === String(journeySeed.office || "") &&
      String(journey?.checkedOutAt || "") ===
        String(journeySeed.checkedOutAt || "") &&
      !journey?.returnedAt
    );
  });
}

async function ensureRecoveredActiveJourney({
  dayCache,
  statsPath,
  boxId,
  boxData,
}) {
  const journeySeed = buildOperationalJourneySeed(boxId, boxData);
  if (!journeySeed) {
    return null;
  }

  const recoveredDayState = await loadTrackedDay(
    dayCache,
    statsPath,
    journeySeed.weekKey,
    journeySeed.dateKey,
    journeySeed.dayContext
  );
  const existingJourney = findMatchingOpenJourney(
    recoveredDayState?.data,
    journeySeed.journey
  );

  if (existingJourney) {
    recoveredDayState.data.uniqueBoxes[boxId] = true;
    return {
      dayState: recoveredDayState,
      journey: existingJourney,
      eventId: String(existingJourney.eventId || journeySeed.eventId),
    };
  }

  recoveredDayState.data.checkoutCount += 1;
  recoveredDayState.data.movementCount += 1;
  recoveredDayState.data.uniqueBoxes[boxId] = true;
  recoveredDayState.data.journeys[journeySeed.eventId] = journeySeed.journey;
  recoveredDayState.data.lastUpdatedAt = journeySeed.dayContext.isoStamp;

  return {
    dayState: recoveredDayState,
    journey: recoveredDayState.data.journeys[journeySeed.eventId],
    eventId: journeySeed.eventId,
  };
}

function applyTrackedDayUpdates(dayCache, statsPath, updates, fallbackIsoStamp = "") {
  const touchedWeeks = new Map();

  dayCache.forEach((state) => {
    updates[`${statsPath}/${state.weekKey}/days/${state.dateKey}`] = state.data;

    const lastUpdatedAt = String(state?.data?.lastUpdatedAt || fallbackIsoStamp || "");
    const existingWeek = touchedWeeks.get(state.weekKey);

    if (
      !existingWeek ||
      String(existingWeek.lastUpdatedAt || "") < lastUpdatedAt
    ) {
      touchedWeeks.set(state.weekKey, {
        lastUpdatedAt,
        referenceDate: createDateFromDateKey(state.dateKey) || new Date(),
      });
    }
  });

  touchedWeeks.forEach(({ lastUpdatedAt, referenceDate }) => {
    setWeekMetadata(
      updates,
      statsPath,
      createWeekContext(referenceDate),
      lastUpdatedAt || fallbackIsoStamp
    );
  });
}

async function loadTrackedDay(dayCache, statsPath, weekKey, dateKey, dayContext = null) {
  const cacheKey = `${weekKey}:${dateKey}`;
  if (dayCache.has(cacheKey)) {
    return dayCache.get(cacheKey);
  }

  const snapshot = await get(ref(db, `${statsPath}/${weekKey}/days/${dateKey}`));
  if (!snapshot.exists() && !dayContext) {
    return null;
  }

  const state = {
    weekKey,
    dateKey,
    data: normalizeDaySummary(snapshot.exists() ? snapshot.val() : null, dayContext),
  };

  dayCache.set(cacheKey, state);
  return state;
}

function setWeekMetadata(updates, statsPath, weekContext, lastUpdatedAt) {
  const weekPath = `${statsPath}/${weekContext.weekKey}`;
  updates[`${weekPath}/weekKey`] = weekContext.weekKey;
  updates[`${weekPath}/weekStartDateKey`] = weekContext.weekStartDateKey;
  updates[`${weekPath}/weekEndDateKey`] = weekContext.weekEndDateKey;
  updates[`${weekPath}/weekLabel`] = weekContext.weekLabel;
  updates[`${weekPath}/weekStartDayLabel`] = weekContext.weekStartDayLabel;
  updates[`${weekPath}/lastUpdatedAt`] = lastUpdatedAt;
}

function normalizeJourneyView(journey, nowIso) {
  const current = journey && typeof journey === "object" ? journey : {};
  const isInProgress = !current.returnedAt;
  const liveDuration = isInProgress
    ? calculateDurationMinutes(current.checkedOutAt, nowIso)
    : Number.isFinite(Number(current.durationMinutes))
      ? Number(current.durationMinutes)
      : calculateDurationMinutes(current.checkedOutAt, current.returnedAt);

  return {
    eventId: String(current.eventId || ""),
    boxId: String(current.boxId || ""),
    office: String(current.office || ""),
    officeLabel: String(
      current.officeLabel ||
        (current.office ? `Office ${current.office}` : "Office not recorded")
    ),
    checkedOutAt: String(current.checkedOutAt || ""),
    checkedOutLabel: String(current.checkedOutLabel || ""),
    checkedOutBy: String(current.checkedOutBy || "Not recorded"),
    returnedAt: String(current.returnedAt || ""),
    returnedLabel: isInProgress
      ? "Still in office"
      : String(current.returnedLabel || "Unavailable"),
    returnedBy: String(current.returnedBy || ""),
    returnDayLabel: String(current.returnDayLabel || ""),
    returnedTo: String(current.returnedTo || ""),
    durationMinutes: liveDuration,
    durationLabel: isInProgress
      ? liveDuration == null
        ? "In progress"
        : `${formatDurationMinutes(liveDuration)} so far`
      : liveDuration == null
        ? String(current.durationLabel || "Unavailable")
        : formatDurationMinutes(liveDuration),
    status: isInProgress
      ? "In progress"
      : String(current.status || "Returned"),
    isInProgress,
  };
}

function normalizeReturnView(returnEvent) {
  const current = returnEvent && typeof returnEvent === "object" ? returnEvent : {};
  const durationMinutes = Number.isFinite(Number(current.durationMinutes))
    ? Number(current.durationMinutes)
    : null;

  return {
    eventId: String(current.eventId || ""),
    boxId: String(current.boxId || ""),
    office: String(current.office || ""),
    officeLabel: String(
      current.officeLabel ||
        (current.office ? `Office ${current.office}` : "Office not recorded")
    ),
    returnedAt: String(current.returnedAt || ""),
    returnedLabel: String(current.returnedLabel || ""),
    returnedBy: String(current.returnedBy || "Not recorded"),
    checkoutDayLabel: String(current.checkoutDayLabel || ""),
    durationMinutes,
    durationLabel:
      durationMinutes == null
        ? String(current.durationLabel || "Unavailable")
        : formatDurationMinutes(durationMinutes),
    status: String(current.status || "Returned to safe"),
  };
}

function buildWeekView(weekData, referenceDate = new Date()) {
  const weekContext = createWeekContext(referenceDate);
  const rawWeek = weekData && typeof weekData === "object" ? weekData : {};
  const rawDays =
    rawWeek.days && typeof rawWeek.days === "object" && !Array.isArray(rawWeek.days)
      ? rawWeek.days
      : {};
  const nowIso = new Date().toISOString();
  const uniqueBoxSet = new Set();

  const days = weekContext.days.map((dayContext) => {
    const dayData = normalizeDaySummary(rawDays[dayContext.dateKey], {
      ...createDayContext(createDateFromDateKey(dayContext.dateKey) || new Date()),
      dateKey: dayContext.dateKey,
      dayName: dayContext.dayName,
      displayDate: dayContext.displayDate,
      dayLabel: dayContext.dayLabel,
    });
    const journeys = Object.values(dayData.journeys)
      .map((journey) => normalizeJourneyView(journey, nowIso))
      .sort((left, right) =>
        String(left.checkedOutAt).localeCompare(String(right.checkedOutAt))
      );
    const returns = Object.values(dayData.returns)
      .map((returnEvent) => normalizeReturnView(returnEvent))
      .sort((left, right) =>
        String(left.returnedAt).localeCompare(String(right.returnedAt))
      );
    const uniqueBoxCount = Object.keys(dayData.uniqueBoxes).length;
    const bookedOutBoxCount = new Set(
      journeys
        .map((journey) => String(journey.boxId || "").trim())
        .filter(Boolean)
    ).size;

    Object.keys(dayData.uniqueBoxes).forEach((boxId) => {
      uniqueBoxSet.add(boxId);
    });

    return {
      dateKey: dayContext.dateKey,
      dayName: dayContext.dayName,
      displayDate: dayContext.displayDate,
      dayLabel: dayContext.dayLabel,
      checkoutCount: dayData.checkoutCount,
      returnCount: dayData.returnCount,
      movementCount: dayData.movementCount,
      bookedOutBoxCount,
      uniqueBoxCount,
      journeys,
      returns,
      hasActivity:
        dayData.movementCount > 0 || journeys.length > 0 || returns.length > 0,
    };
  });

  return {
    weekKey: weekContext.weekKey,
    weekLabel: String(rawWeek.weekLabel || weekContext.weekLabel),
    weekStartDateKey: String(
      rawWeek.weekStartDateKey || weekContext.weekStartDateKey
    ),
    weekEndDateKey: String(rawWeek.weekEndDateKey || weekContext.weekEndDateKey),
    weekStartDayLabel: String(
      rawWeek.weekStartDayLabel || weekContext.weekStartDayLabel
    ),
    days,
    totalMovements: days.reduce((total, day) => total + day.movementCount, 0),
    totalCheckouts: days.reduce((total, day) => total + day.checkoutCount, 0),
    totalReturns: days.reduce((total, day) => total + day.returnCount, 0),
    totalBoxesBookedOut: days.reduce(
      (total, day) => total + day.bookedOutBoxCount,
      0
    ),
    totalUniqueBoxes: uniqueBoxSet.size,
  };
}

function buildWeeklyBoxSummaries(weekView) {
  const days = Array.isArray(weekView?.days) ? weekView.days : [];
  const boxSummaries = new Map();

  days.forEach((day) => {
    day.journeys.forEach((journey) => {
      const boxId = String(journey.boxId || "").trim();
      if (!boxId) return;

      if (!boxSummaries.has(boxId)) {
        boxSummaries.set(boxId, {
          boxId,
          totalTimesBookedOut: 0,
          totalTimeSeenMinutes: 0,
          days: days.map((weekDay) => ({
            dateKey: weekDay.dateKey,
            dayLabel: weekDay.dayLabel,
            offices: [],
          })),
          historyEntries: [],
        });
      }

      const summary = boxSummaries.get(boxId);
      const daySummary = summary.days.find(
        (weekDay) => weekDay.dateKey === day.dateKey
      );
      const detailId = `weekly-history-${sanitizeKeySegment(
        journey.eventId || `${boxId}-${day.dateKey}-${journey.office}`
      )}`;
      const durationMinutes =
        Number.isFinite(Number(journey.durationMinutes)) &&
        Number(journey.durationMinutes) >= 0
          ? Number(journey.durationMinutes)
          : 0;

      summary.totalTimesBookedOut += 1;
      summary.totalTimeSeenMinutes += durationMinutes;

      if (daySummary) {
        daySummary.offices.push({
          detailId,
          office: String(journey.office || ""),
          officeLabel: String(journey.officeLabel || ""),
          checkedOutLabel: String(journey.checkedOutLabel || ""),
        });
      }

      summary.historyEntries.push({
        ...journey,
        detailId,
        dateKey: day.dateKey,
        dayLabel: day.dayLabel,
      });
    });
  });

  return [...boxSummaries.values()]
    .map((summary) => ({
      ...summary,
      totalTimeSeenLabel: formatDurationMinutes(summary.totalTimeSeenMinutes),
      historyEntries: summary.historyEntries.sort((left, right) =>
        String(left.checkedOutAt).localeCompare(String(right.checkedOutAt))
      ),
      activeDateKeys: summary.days
        .filter((day) => day.offices.length)
        .map((day) => day.dateKey),
    }))
    .sort((left, right) =>
      String(left.boxId).localeCompare(String(right.boxId), undefined, {
        numeric: true,
      })
    );
}

async function recordWeeklyCheckoutActivity({
  user,
  boxIds = [],
  boxEntries = [],
  officeNumber,
  checkedOutBy = "",
  occurredAt = new Date(),
}) {
  const normalizedBoxIds = [...new Set(boxIds.map((boxId) => String(boxId).trim()))]
    .filter(Boolean);
  const boxDataById = new Map(
    boxEntries
      .map((entry) => ({
        boxId: String(entry?.boxId || "").trim(),
        boxData:
          entry?.boxData && typeof entry.boxData === "object" ? entry.boxData : {},
      }))
      .filter((entry) => entry.boxId)
      .map((entry) => [entry.boxId, entry.boxData])
  );

  if (!normalizedBoxIds.length) {
    return;
  }

  const dayContext = createDayContext(occurredAt);
  const statsPath = getWeeklyStatsCollectionPath(user);
  const activePath = getActiveWeeklyMovementsPath(user);
  const dayCache = new Map();
  const updates = {};
  const activeSnapshot = await get(ref(db, activePath));
  const activeMovements =
    activeSnapshot.exists() &&
    activeSnapshot.val() &&
    typeof activeSnapshot.val() === "object"
      ? activeSnapshot.val()
      : {};
  const currentDayState = await loadTrackedDay(
    dayCache,
    statsPath,
    dayContext.week.weekKey,
    dayContext.dateKey,
    dayContext
  );

  for (const [index, boxId] of normalizedBoxIds.entries()) {
    const activePointer = activeMovements[boxId];
    const boxData = boxDataById.get(boxId) || {};
    let previousDayState = null;
    let previousJourney = null;

    if (
      activePointer?.weekKey &&
      activePointer?.dateKey &&
      activePointer?.eventId
    ) {
      previousDayState =
        activePointer.weekKey === dayContext.week.weekKey &&
        activePointer.dateKey === dayContext.dateKey
          ? currentDayState
          : await loadTrackedDay(
              dayCache,
              statsPath,
              String(activePointer.weekKey),
              String(activePointer.dateKey)
            );

      previousJourney =
        previousDayState?.data?.journeys?.[String(activePointer.eventId)] || null;
    }

    if ((!previousJourney || previousJourney.returnedAt) && boxDataById.has(boxId)) {
      const recoveredJourney = await ensureRecoveredActiveJourney({
        dayCache,
        statsPath,
        boxId,
        boxData,
      });

      if (recoveredJourney?.journey && !recoveredJourney.journey.returnedAt) {
        previousDayState = recoveredJourney.dayState;
        previousJourney = recoveredJourney.journey;
      }
    }

    if (previousJourney && !previousJourney.returnedAt) {
      const durationMinutes = calculateDurationMinutes(
        previousJourney.checkedOutAt,
        dayContext.isoStamp
      );

      previousJourney.returnedAt = dayContext.isoStamp;
      previousJourney.returnedLabel = dayContext.timeLabel;
      previousJourney.returnedBy = checkedOutBy || "Not recorded";
      previousJourney.returnDateKey = dayContext.dateKey;
      previousJourney.returnDayLabel = dayContext.dayLabel;
      previousJourney.returnedTo = `Office ${officeNumber}`;
      previousJourney.durationMinutes = durationMinutes;
      previousJourney.durationLabel =
        durationMinutes == null
          ? "Unavailable"
          : formatDurationMinutes(durationMinutes);
      previousJourney.status = "Transferred";
      previousDayState.data.lastUpdatedAt = dayContext.isoStamp;
    }

    const eventId = buildEventId(
      "journey",
      boxId,
      officeNumber,
      dayContext.timestampMs,
      index
    );

    currentDayState.data.checkoutCount += 1;
    currentDayState.data.movementCount += 1;
    currentDayState.data.uniqueBoxes[boxId] = true;
    currentDayState.data.journeys[eventId] = {
      eventId,
      boxId,
      office: String(officeNumber),
      officeLabel: `Office ${officeNumber}`,
      checkedOutAt: dayContext.isoStamp,
      checkedOutLabel: dayContext.timeLabel,
      checkedOutBy: checkedOutBy || "Not recorded",
      checkedOutDateKey: dayContext.dateKey,
      checkedOutDayLabel: dayContext.dayLabel,
      returnedAt: "",
      returnedLabel: "",
      returnedBy: "",
      returnDateKey: "",
      returnDayLabel: "",
      returnedTo: "",
      durationMinutes: null,
      durationLabel: "In progress",
      status: "In progress",
    };

    updates[`${activePath}/${boxId}`] = {
      boxId,
      weekKey: dayContext.week.weekKey,
      dateKey: dayContext.dateKey,
      eventId,
    };
  }

  currentDayState.data.lastUpdatedAt = dayContext.isoStamp;
  applyTrackedDayUpdates(dayCache, statsPath, updates, dayContext.isoStamp);

  await update(ref(db), updates);
}

async function recordWeeklyCheckInActivity({
  user,
  boxEntries = [],
  returnedBy = "",
  occurredAt = new Date(),
}) {
  const normalizedEntries = boxEntries
    .map((entry) => ({
      boxId: String(entry?.boxId || "").trim(),
      boxData:
        entry?.boxData && typeof entry.boxData === "object" ? entry.boxData : {},
    }))
    .filter((entry) => entry.boxId);

  if (!normalizedEntries.length) {
    return;
  }

  const dayContext = createDayContext(occurredAt);
  const statsPath = getWeeklyStatsCollectionPath(user);
  const activePath = getActiveWeeklyMovementsPath(user);
  const dayCache = new Map();
  const updates = {};
  const activeSnapshot = await get(ref(db, activePath));
  const activeMovements =
    activeSnapshot.exists() &&
    activeSnapshot.val() &&
    typeof activeSnapshot.val() === "object"
      ? activeSnapshot.val()
      : {};
  const currentDayState = await loadTrackedDay(
    dayCache,
    statsPath,
    dayContext.week.weekKey,
    dayContext.dateKey,
    dayContext
  );

  for (const [index, entry] of normalizedEntries.entries()) {
    const { boxId, boxData } = entry;
    const activePointer = activeMovements[boxId];
    const currentOffice = String(boxData.boxoffice || "");
    let checkoutDayLabel = "";
    let durationMinutes = null;
    let previousDayState = null;
    let previousJourney = null;

    if (
      activePointer?.weekKey &&
      activePointer?.dateKey &&
      activePointer?.eventId
    ) {
      previousDayState =
        activePointer.weekKey === dayContext.week.weekKey &&
        activePointer.dateKey === dayContext.dateKey
          ? currentDayState
          : await loadTrackedDay(
              dayCache,
              statsPath,
              String(activePointer.weekKey),
              String(activePointer.dateKey)
            );

      previousJourney =
        previousDayState?.data?.journeys?.[String(activePointer.eventId)] || null;
    }

    if ((!previousJourney || previousJourney.returnedAt) && boxData) {
      const recoveredJourney = await ensureRecoveredActiveJourney({
        dayCache,
        statsPath,
        boxId,
        boxData,
      });

      if (recoveredJourney?.journey && !recoveredJourney.journey.returnedAt) {
        previousDayState = recoveredJourney.dayState;
        previousJourney = recoveredJourney.journey;
      }
    }

    if (previousJourney && !previousJourney.returnedAt) {
      durationMinutes = calculateDurationMinutes(
        previousJourney.checkedOutAt,
        dayContext.isoStamp
      );
      checkoutDayLabel = String(previousJourney.checkedOutDayLabel || "");
      previousJourney.returnedAt = dayContext.isoStamp;
      previousJourney.returnedLabel = dayContext.timeLabel;
      previousJourney.returnedBy = returnedBy || "Not recorded";
      previousJourney.returnDateKey = dayContext.dateKey;
      previousJourney.returnDayLabel = dayContext.dayLabel;
      previousJourney.returnedTo = "In Safe";
      previousJourney.durationMinutes = durationMinutes;
      previousJourney.durationLabel =
        durationMinutes == null
          ? "Unavailable"
          : formatDurationMinutes(durationMinutes);
      previousJourney.status = "Returned to safe";
      previousDayState.data.lastUpdatedAt = dayContext.isoStamp;
    }

    const returnEventId = buildEventId(
      "return",
      boxId,
      currentOffice || "in-safe",
      dayContext.timestampMs,
      index
    );

    currentDayState.data.returnCount += 1;
    currentDayState.data.movementCount += 1;
    currentDayState.data.uniqueBoxes[boxId] = true;
    currentDayState.data.returns[returnEventId] = {
      eventId: returnEventId,
      boxId,
      office: currentOffice,
      officeLabel: currentOffice
        ? `Office ${currentOffice}`
        : "Office not recorded",
      returnedAt: dayContext.isoStamp,
      returnedLabel: dayContext.timeLabel,
      returnedBy: returnedBy || "Not recorded",
      checkoutDayLabel,
      durationMinutes,
      durationLabel:
        durationMinutes == null ? "Unavailable" : formatDurationMinutes(durationMinutes),
      status: "Returned to safe",
    };
    updates[`${activePath}/${boxId}`] = null;
  }

  currentDayState.data.lastUpdatedAt = dayContext.isoStamp;
  applyTrackedDayUpdates(dayCache, statsPath, updates, dayContext.isoStamp);

  await update(ref(db), updates);
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function estimateSpreadsheetColumnWidth(value) {
  const normalizedValue = String(value ?? "");
  const longestLineLength = normalizedValue
    .split(/\r?\n/)
    .reduce((longestLength, line) => Math.max(longestLength, line.length), 0);

  // SpreadsheetML column widths are expressed in points. Since Excel's
  // built-in autofit doesn't expand text columns reliably in this format,
  // estimate a readable width from the longest cell value in the column.
  return Math.min(720, Math.max(72, 12 + longestLineLength * 6.4));
}

function buildColumnXml(rows) {
  const maxColumnCount = rows.reduce(
    (highestCount, row) =>
      Math.max(highestCount, Array.isArray(row) ? row.length : 0),
    0
  );

  if (!maxColumnCount) {
    return "";
  }

  const columnWidths = Array.from({ length: maxColumnCount }, (_, columnIndex) =>
    rows.reduce((widestWidth, row) => {
      const cellValue = Array.isArray(row) ? row[columnIndex] : "";
      return Math.max(widestWidth, estimateSpreadsheetColumnWidth(cellValue));
    }, 72)
  );

  return columnWidths
    .map(
      (width) =>
        `<Column ss:AutoFitWidth="0" ss:Width="${Number(width.toFixed(2))}" />`
    )
    .join("");
}

function buildSheetXml(sheetName, rows, options = {}) {
  const safeSheetName = String(sheetName || "Sheet")
    .replace(/[\\/*?:[\]]/g, "-")
    .slice(0, 31);
  const {
    enableAutoFilter = false,
    wrapColumnIndexes = [],
  } = options;
  const wrappedColumnIndexes = new Set(
    wrapColumnIndexes
      .map((columnIndex) => Number(columnIndex))
      .filter((columnIndex) => Number.isInteger(columnIndex) && columnIndex >= 0)
  );
  const maxColumnCount = rows.reduce(
    (highestCount, row) =>
      Math.max(highestCount, Array.isArray(row) ? row.length : 0),
    0
  );
  const columnsXml = buildColumnXml(rows);

  const rowsXml = rows
    .map((row, rowIndex) => {
      const cellsXml = row
        .map((cell, columnIndex) => {
          const isNumber = typeof cell === "number" && Number.isFinite(cell);
          let styleId = "";

          if (rowIndex === 0) {
            styleId = ' ss:StyleID="Header"';
          } else if (wrappedColumnIndexes.has(columnIndex)) {
            styleId = ' ss:StyleID="WrappedText"';
          }

          return `<Cell${styleId}><Data ss:Type="${
            isNumber ? "Number" : "String"
          }">${escapeXml(cell)}</Data></Cell>`;
        })
        .join("");

      return `<Row>${cellsXml}</Row>`;
    })
    .join("");
  const autoFilterXml =
    enableAutoFilter && rows.length > 1 && maxColumnCount > 0
      ? `<AutoFilter x:Range="R1C1:R${rows.length}C${maxColumnCount}" xmlns="urn:schemas-microsoft-com:office:excel" />`
      : "";

  return `<Worksheet ss:Name="${escapeXml(
    safeSheetName
  )}"><Table>${columnsXml}${rowsXml}</Table>${autoFilterXml}</Worksheet>`;
}

function buildWorkbookXml(sheets) {
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook
  xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40"
>
  <Styles>
    <Style ss:ID="Header">
      <Font ss:Bold="1" />
      <Interior ss:Color="#F6D7D9" ss:Pattern="Solid" />
    </Style>
    <Style ss:ID="WrappedText">
      <Alignment ss:Vertical="Top" ss:WrapText="1" />
    </Style>
  </Styles>
  ${sheets.join("")}
</Workbook>`;
}

function downloadWeeklyStatsWorkbook(weekView) {
  const boxSummaries = buildWeeklyBoxSummaries(weekView);
  const dailySheetHeaders = [
    "Item",
    "Office",
    "Duration In Office",
    "Booked Out At",
    "Booked Out By",
    "Returned At",
    "Returned By",
  ];

  const weeklySummaryRows = [
    [
      "Item",
      ...weekView.days.map((day) => day.dayLabel),
      "Total Duration Out",
      "Total Times Seen",
    ],
    ...boxSummaries.map((summary) => [
      `Item ${summary.boxId}`,
      ...weekView.days.map((day) => {
        const dayEntries = summary.historyEntries.filter(
          (entry) => entry.dateKey === day.dateKey
        );

        return dayEntries.length
          ? [...new Set(dayEntries.map((entry) => String(entry.officeLabel || "").trim()).filter(Boolean))].join("; ")
          : "None"
      }),
      summary.totalTimeSeenLabel,
      summary.totalTimesBookedOut,
    ]),
  ];

  const dailySheets = weekView.days.map((day) => {
    const sortedJourneys = [...day.journeys].sort((left, right) => {
      const boxCompare = String(left.boxId || "").localeCompare(
        String(right.boxId || ""),
        undefined,
        { numeric: true }
      );

      if (boxCompare !== 0) {
        return boxCompare;
      }

      return String(left.checkedOutAt || "").localeCompare(
        String(right.checkedOutAt || "")
      );
    });

    const rows = [
      dailySheetHeaders,
      ...sortedJourneys.map((journey) => [
        `Item ${journey.boxId}`,
        journey.officeLabel,
        journey.durationLabel,
        journey.checkedOutLabel,
        journey.checkedOutBy,
        journey.returnedLabel,
        journey.returnedLabel === "Still in office"
          ? "Not yet returned"
          : journey.returnedBy || "Not recorded",
      ]),
    ];

    if (rows.length === 1) {
      rows.push(["No item activity recorded for this day.", "", "", "", "", "", ""]);
    }

    return buildSheetXml(day.dayLabel, rows, {
      enableAutoFilter: true,
    });
  });

  const workbookXml = buildWorkbookXml([
    ...dailySheets,
    buildSheetXml("Weekly Summary", weeklySummaryRows, {
      enableAutoFilter: true,
      wrapColumnIndexes: weekView.days.map((_, index) => index + 1),
    }),
  ]);
  const fileName = `weekly-stats-${weekView.weekStartDateKey}-to-${weekView.weekEndDateKey}.xls`;
  const blob = new Blob([workbookXml], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const objectUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");

  downloadLink.href = objectUrl;
  downloadLink.download = fileName;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 0);
}

export {
  buildWeekView,
  buildWeeklyBoxSummaries,
  createDayContext,
  createWeekContext,
  downloadWeeklyStatsWorkbook,
  formatDurationMinutes,
  recordWeeklyCheckInActivity,
  recordWeeklyCheckoutActivity,
};
