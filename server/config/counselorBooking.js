/**
 * GCO canonical service labels (must match UI and DB `service_type` values).
 */
const ALL_GCO_SERVICES = [
  "Befriending",
  "Counseling",
  "Academic/Probation Follow up",
  "Individual Inventory",
  "Placement Program",
  "Faculty/Parent Consultation"
];

const BOBBY_SERVICES = ["Befriending", "Counseling", "Placement Program"];

function hhmmToMinutes(hhmm) {
  const [h, m] = String(hhmm).slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function minutesToHHMM(total) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatAmPm(hhmm) {
  const [h, m] = String(hhmm).slice(0, 5).split(":").map(Number);
  const am = h < 12;
  const h12 = h % 12 || 12;
  const suffix = am ? "AM" : "PM";
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/**
 * @typedef {{ start: string, end: string }} TimeWindow HH:MM inclusive start, exclusive end of service availability.
 * @typedef {{ services: string[], sessionMinutes: number, slotStepMinutes: number, windows: TimeWindow[] }} CounselorBookingProfile
 */

/** @type {CounselorBookingProfile} */
const DEFAULT_PROFILE = {
  services: [...ALL_GCO_SERVICES],
  sessionMinutes: 60,
  slotStepMinutes: 60,
  windows: [
    { start: "08:00", end: "12:00" },
    { start: "13:00", end: "16:00" }
  ]
};

/**
 * Ordered rules: first matching profile wins (by display name or email).
 * @type {Array<{ test: (name: string, email: string) => boolean, profile: CounselorBookingProfile }>}
 */
const PROFILE_RULES = [
  {
    test: (name, email) => /\bbobby\b/i.test(name) || /bobby/i.test(email),
    profile: {
      services: [...BOBBY_SERVICES],
      sessionMinutes: 40,
      slotStepMinutes: 15,
      windows: [
        { start: "08:15", end: "09:35" },
        { start: "01:00", end: "03:00" }
    }
  },
  {
    test: (name, email) => /\blarry\b/i.test(name) || /larry/i.test(email),
    profile: {
      services: [...ALL_GCO_SERVICES],
      sessionMinutes: 60,
      slotStepMinutes: 60,
      windows: [
        { start: "08:00", end: "11:00" },
        { start: "13:00", end: "15:00" }
      ]
    }
  },
  {
    test: (name, email) => /\bchaisa\b/i.test(name) || /chaisa/i.test(email),
    profile: {
      services: [...ALL_GCO_SERVICES],
      sessionMinutes: 60,
      slotStepMinutes: 60,
      windows: [
        { start: "08:00", end: "11:00" },
        { start: "13:00", end: "16:00" }
      ]
    }
  },
  {
    test: (name, email) => /\bfaith\b/i.test(name) || /faith/i.test(email),
    profile: {
      services: [...ALL_GCO_SERVICES],
      sessionMinutes: 60,
      slotStepMinutes: 60,
      windows: [
        { start: "08:00", end: "12:00" },
        { start: "14:00", end: "16:00" }
      ]
    }
  },
  {
    test: (name, email) => /\bsean\b/i.test(name) || /sean/i.test(email),
    profile: {
      services: [...ALL_GCO_SERVICES],
      sessionMinutes: 60,
      slotStepMinutes: 60,
      windows: [
        { start: "08:00", end: "12:00" },
        { start: "13:00", end: "16:00" }
      ]
    }
  },
  {
    test: (name, email) => /\bjegonia\b/i.test(name) || /jegonia/i.test(email),
    profile: {
      services: [...ALL_GCO_SERVICES],
      sessionMinutes: 60,
      slotStepMinutes: 60,
      windows: [
        { start: "08:00", end: "12:00" },
        { start: "13:00", end: "15:00" }
      ]
    }
  }
];

function resolveCounselorProfile(fullName, email) {
  const name = String(fullName || "");
  const em = String(email || "");
  const rule = PROFILE_RULES.find((r) => r.test(name, em));
  return rule ? { ...rule.profile, services: [...rule.profile.services] } : { ...DEFAULT_PROFILE, services: [...DEFAULT_PROFILE.services] };
}

/** Monday=1 … Friday=5 */
function isoWeekday(isoDate) {
  const d = new Date(`${isoDate}T12:00:00`);
  const dow = d.getDay();
  return dow === 0 ? 7 : dow;
}

function isSaturday(isoDate) {
  return new Date(`${isoDate}T12:00:00`).getDay() === 6;
}

/** Office booking: weekdays only (Mon–Fri). Saturdays explicitly excluded per policy. */
function isOfficeBookableDay(isoDate) {
  const wd = isoWeekday(isoDate);
  return wd >= 1 && wd <= 5;
}

/**
 * Build bookable start times from profile windows.
 * @param {CounselorBookingProfile} profile
 * @param {string} isoDate YYYY-MM-DD
 */
function buildSlotsForDate(profile, isoDate) {
  if (!isoDate || !isOfficeBookableDay(isoDate)) return [];
  const { sessionMinutes, slotStepMinutes, windows } = profile;
  const seen = new Set();
  const slots = [];
  for (const w of windows) {
    const w0 = hhmmToMinutes(w.start);
    const w1 = hhmmToMinutes(w.end);
    for (let t = w0; t + sessionMinutes <= w1; t += slotStepMinutes) {
      const value = minutesToHHMM(t);
      if (seen.has(value)) continue;
      seen.add(value);
      const endT = t + sessionMinutes;
      const label = `${formatAmPm(value)} – ${formatAmPm(minutesToHHMM(endT))} (${sessionMinutes} min)`;
      slots.push({ value, label, durationMinutes: sessionMinutes });
    }
  }
  slots.sort((a, b) => a.value.localeCompare(b.value));
  return slots;
}

function sessionEndHHMMSS(startHHMM, sessionMinutes) {
  const startMin = hhmmToMinutes(startHHMM);
  const endMin = startMin + sessionMinutes;
  const eh = String(Math.floor(endMin / 60)).padStart(2, "0");
  const em = String(endMin % 60).padStart(2, "0");
  return `${eh}:${em}:00`;
}

/** Minimum gap between session *starts* (turnaround buffer after prior session). */
const START_GAP_BUFFER_MIN = 30;

/**
 * Validate a student booking against counselor profile and calendar rules.
 * @param {{ fullName: string, email: string }} counselor
 */
function validateStudentBooking(counselor, { date, timeHHMM, serviceType }) {
  const profile = resolveCounselorProfile(counselor.fullName, counselor.email);
  if (!date) return { ok: false, message: "Appointment date is required." };
  if (isSaturday(date)) return { ok: false, message: "Bookings are not available on Saturdays." };
  if (!isOfficeBookableDay(date)) return { ok: false, message: "Bookings are only available Monday through Friday." };

  if (!profile.services.includes(String(serviceType))) {
    return { ok: false, message: "This service is not available for the selected counselor." };
  }

  const slots = buildSlotsForDate(profile, date);
  const canonical = String(timeHHMM).slice(0, 5);
  const slot = slots.find((s) => s.value === canonical);
  if (!slot) {
    return { ok: false, message: "Invalid time slot for this counselor and date." };
  }

  return {
    ok: true,
    profile,
    sessionMinutes: slot.durationMinutes,
    sessionEndHHMMSS: sessionEndHHMMSS(canonical, slot.durationMinutes)
  };
}

/**
 * True if two sessions cannot both be scheduled (overlap or violate turnaround gap).
 */
function appointmentsConflict(startA, durA, startB, durB) {
  const a0 = hhmmToMinutes(String(startA).slice(0, 5));
  const b0 = hhmmToMinutes(String(startB).slice(0, 5));
  const a1 = a0 + durA;
  const b1 = b0 + durB;
  return !(a1 + START_GAP_BUFFER_MIN <= b0 || b1 + START_GAP_BUFFER_MIN <= a0);
}

function blocksInterval(timeHHMM, sessionMinutes, sessionEndStr, blockStartStr, blockEndStr) {
  const t0 = `${String(timeHHMM).slice(0, 5)}:00`;
  const bs = blockStartStr ? String(blockStartStr).slice(0, 8) : "00:00:00";
  const be = blockEndStr ? String(blockEndStr).slice(0, 8) : "23:59:59";
  return t0 < be && sessionEndStr > bs;
}

module.exports = {
  ALL_GCO_SERVICES,
  BOBBY_SERVICES,
  resolveCounselorProfile,
  buildSlotsForDate,
  validateStudentBooking,
  sessionEndHHMMSS,
  isoWeekday,
  isSaturday,
  isOfficeBookableDay,
  appointmentsConflict,
  blocksInterval,
  hhmmToMinutes,
  START_GAP_BUFFER_MIN
};
