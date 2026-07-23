const Settings = require("../models/settings.Models");
const { USER_ROLES } = require("../helpers/constants");
const { getHourInTimezone } = require("../helpers/timezone");

async function enforceBranchManagerLoginWindow(req, res, next) {
  // Skip for non-branch-managers
  if (!req.user || req.user.role !== USER_ROLES.BRANCH_MANAGER) {
    return next();
  }

  try {
    const settings = await Settings.findOne().lean();
    const lw = settings?.loginWindow || {};

    // If the window feature is disabled, allow anytime
    if (lw.branchManagerEnabled === false) {
      return next();
    }

    const hour = getHourInTimezone(lw.timezone || "Asia/Dhaka");

    if (!Number.isFinite(hour)) {
      // If time-check fails for any reason, allow access rather than block
      return next();
    }

    const start = lw.startHour ?? 8;
    const end = lw.endHour ?? 23;

    if (hour < start || hour >= end) {
      return res.status(403).json({
        success: false,
        message: `Branch manager panel is available from ${String(start).padStart(2, "0")}:00 to ${String(end).padStart(2, "0")}:00 (${lw.timezone || "Asia/Dhaka"}).`,
        code: "LOGIN_WINDOW_CLOSED",
      });
    }

    return next();
  } catch (err) {
    // If settings fetch fails, fall back to hardcoded window
    const hour = getHourInTimezone("Asia/Dhaka");
    if (Number.isFinite(hour) && (hour < 8 || hour >= 23)) {
      return res.status(403).json({
        success: false,
        message: "Branch manager panel is available from 08:00 to 23:00 (Asia/Dhaka).",
        code: "LOGIN_WINDOW_CLOSED",
      });
    }
    return next();
  }
}

module.exports = { enforceBranchManagerLoginWindow };
