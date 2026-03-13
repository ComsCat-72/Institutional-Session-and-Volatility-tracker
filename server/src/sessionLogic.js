/**
 * Session logic to determine which institutional session is active based on UTC time.
 *
 * The goal is to map a given UTC timestamp to one of:
 * - "London_Open"
 * - "New_York_Open"
 * - "Overlap" (when both sessions are active)
 * - "Quiet" (outside of defined sessions)
 *
 * This module is intentionally simple and deterministic so it can be used
 * for both backend processing and frontend heat-map rendering.
 */

export const SESSIONS = {
  LONDON: {
    id: "London_Open",
    label: "London Open",
    startUtcHour: 7,
    endUtcHour: 10,
  },
  NEW_YORK: {
    id: "New_York_Open",
    label: "New York Open",
    startUtcHour: 12,
    endUtcHour: 15,
  },
};

export const SESSION_IDS = {
  LONDON: SESSIONS.LONDON.id,
  NEW_YORK: SESSIONS.NEW_YORK.id,
  OVERLAP: "Overlap",
  QUIET: "Quiet",
};

export function getUtcHour(date = new Date()) {
  // Normalize to UTC hour (0-23)
  return date.getUTCHours();
}

export function isWithinWindow(hour, session) {
  // Inclusive start, exclusive end (common in trading time windows).
  return hour >= session.startUtcHour && hour < session.endUtcHour;
}

export function determineSession(date = new Date()) {
  const hour = getUtcHour(date);

  const inLondon = isWithinWindow(hour, SESSIONS.LONDON);
  const inNewYork = isWithinWindow(hour, SESSIONS.NEW_YORK);

  if (inLondon && inNewYork) {
    return SESSION_IDS.OVERLAP;
  }

  if (inLondon) {
    return SESSION_IDS.LONDON;
  }

  if (inNewYork) {
    return SESSION_IDS.NEW_YORK;
  }

  return SESSION_IDS.QUIET;
}

export function sessionLabel(sessionId) {
  switch (sessionId) {
    case SESSION_IDS.LONDON:
      return SESSIONS.LONDON.label;
    case SESSION_IDS.NEW_YORK:
      return SESSIONS.NEW_YORK.label;
    case SESSION_IDS.OVERLAP:
      return "London/New York Overlap";
    default:
      return "Quiet";
  }
}
