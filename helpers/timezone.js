/**
 * Get the current hour (0-23) in a specified timezone.
 * Falls back to approximate UTC+X offset if Intl is unavailable.
 */
function getHourInTimezone(tz = "Asia/Dhaka") {
  try {
    const str = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hour12: false,
      timeZone: tz,
    }).format(new Date());
    const h = Number(str);
    if (Number.isFinite(h)) return h;
  } catch (_) {
    // Intl not available
  }

  // Fallback: approximate UTC+X
  const offsetMap = {
    "Asia/Dhaka": 6,
    "Asia/Kolkata": 5.5,
    "Asia/Karachi": 5,
    "UTC": 0,
    "Asia/Dubai": 4,
    "Asia/Bangkok": 7,
    "Asia/Singapore": 8,
  };
  const offset = Math.floor(offsetMap[tz] || 6);
  return (new Date().getUTCHours() + offset) % 24;
}

module.exports = { getHourInTimezone };
