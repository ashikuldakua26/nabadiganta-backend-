const router = require("express").Router();
const { authenticate, authorize } = require("../middlewares/auth");
const { USER_ROLES } = require("../helpers/constants");
const {
  getMyAuditLogs,
  getResourceAuditLogsController,
  getAllAuditLogs,
  getLoginHistory,
  getFailedLogins,
  getUserChangeHistory,
  getAuditStatistics,
} = require("../controllers/audit.controller");

// Get my audit logs (all authenticated users)
router.get("/my", authenticate, getMyAuditLogs);

// Get audit logs for a specific resource
router.get("/resource/:resourceId", authenticate, getResourceAuditLogsController);

// Get all audit logs (admin or superadmin only)
router.get("/all", authenticate, authorize(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN), getAllAuditLogs);

// Get login history (admin or superadmin only)
router.get("/logins", authenticate, authorize(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN), getLoginHistory);

// Get failed login attempts (admin or superadmin only)
router.get("/logins/failed", authenticate, authorize(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN), getFailedLogins);

// Get change history for a user (admin or superadmin only)
router.get("/user/:userId/changes", authenticate, authorize(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN), getUserChangeHistory);

// Get audit statistics (admin or superadmin only)
router.get("/statistics", authenticate, authorize(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN), getAuditStatistics);

module.exports = router;

