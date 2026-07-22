const { USER_ROLES } = require("../helpers/constants");

function getDhakaHour() {
  try {
    // Try Intl first (works on most Node/V8 builds)
    const fmt = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hour12: false,
      timeZone: "Asia/Dhaka",
    });
    const str = fmt.format(new Date());
    const h = Number(str);
    if (Number.isFinite(h)) return h;
  } catch (_) {}

  // Fallback: UTC+6 manual offset
  return (new Date().getUTCHours() + 6) % 24;
}

function enforceBranchManagerLoginWindow(req, res, next) {
  // Skip for non-branch-managers
  if (!req.user || req.user.role !== USER_ROLES.BRANCH_MANAGER) {
    return next();
  }

  let hour = -1;
  try {
    hour = getDhakaHour();
  } catch (err) {
    // If time-check fails for any reason, allow access rather than block
    return next();
  }

  // Allow 08:00 – 23:00 Dhaka time
  if (Number.isFinite(hour) && (hour < 8 || hour >= 23)) {
    return res.status(403).json({
      success: false,
      message: "Branch manager panel is available from 08:00 to 23:00 (Dhaka time).",
      code: "LOGIN_WINDOW_CLOSED",
    });
  }

  return next();
}

module.exports = { enforceBranchManagerLoginWindow };
