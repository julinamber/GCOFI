const express = require("express");
const { getPool } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { resolveCounselorProfile, buildSlotsForDate, isOfficeBookableDay, isSaturday } = require("../config/counselorBooking");

const router = express.Router();

router.get("/counselors", async (req, res) => {
  const { date } = req.query;
  const db = getPool();
  let query = `
    SELECT id, full_name AS name, email
    FROM users
    WHERE role = 'counselor' AND is_active = 1 AND email_verified = 1
  `;
  const params = [];
  if (date) {
    query += `
      AND id NOT IN (
        SELECT counselor_id FROM counselor_unavailabilities WHERE unavailable_date = ?
      )
    `;
    params.push(date);
  }
  query += ` ORDER BY full_name`;
  const [rows] = await db.query(query, params);
  res.json(rows);
});

/** Authenticated: counselor-specific services and time slots for a given date. */
router.get("/booking-options", requireAuth, async (req, res) => {
  const counselorId = Number(req.query.counselorId);
  const dateRaw = req.query.date ? String(req.query.date).slice(0, 10) : "";
  if (!counselorId) return res.status(400).json({ message: "counselorId is required" });

  const db = getPool();
  const [rows] = await db.query(
    "SELECT id, full_name AS fullName, email FROM users WHERE id = ? AND role = 'counselor' AND is_active = 1 AND email_verified = 1",
    [counselorId]
  );
  const c = rows[0];
  if (!c) return res.status(404).json({ message: "Counselor not found" });

  const profile = resolveCounselorProfile(c.fullName, c.email);
  let dayNote = "";
  if (dateRaw) {
    if (isSaturday(dateRaw)) dayNote = "Bookings are not available on Saturdays.";
    else if (!isOfficeBookableDay(dateRaw)) dayNote = "Bookings are only available Monday through Friday.";
  }
  const slots = dateRaw && isOfficeBookableDay(dateRaw) ? buildSlotsForDate(profile, dateRaw) : [];

  res.json({
    counselorId,
    date: dateRaw || null,
    services: profile.services,
    slots,
    dayNote: dayNote || null
  });
});

module.exports = router;
