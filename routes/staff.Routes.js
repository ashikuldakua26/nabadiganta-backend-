const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middlewares/auth");

const staffAndAbove = authorize("staff", "branch_manager", "admin", "superadmin");

// ─── Apply auth to every route below ─────────────────────────────────────────
router.use(authenticate);
router.use(staffAndAbove);

// ─── Lazy-load controller so startup errors are clear ────────────────────────
const ctrl = require("../controllers/staff.controller");

// Dashboard
router.get("/dashboard", ctrl.getStaffDashboard);

// Customers  (read-only)
router.get("/customers",        ctrl.listCustomers);
router.get("/customers/:id",    ctrl.getCustomerDetails);

// Deposits  (read-only)
router.get("/deposits",         ctrl.viewDeposits);
router.get("/deposits/:id",     ctrl.getDepositDetails);

// Loans  (read-only)
router.get("/loans",            ctrl.viewLoans);
router.get("/loans/:id",        ctrl.getLoanDetails);

// Transactions  (read-only)
router.get("/transactions",     ctrl.viewTransactions);
router.get("/transactions/:id", ctrl.getTransactionDetails);

// Messages
router.get("/messages",         ctrl.viewMessages);
router.post("/messages",        ctrl.sendMessage);
router.get("/messages/:id",     ctrl.getMessageDetails);
router.put("/messages/:id/read",ctrl.markMessageRead);

// Team
router.get("/team", ctrl.getTeamMembers);

// Reports
router.get("/reports/daily",   ctrl.getDailyReport);
router.get("/reports/monthly", ctrl.getMonthlyReport);

// Profile
router.get("/profile",  ctrl.getProfile);
router.put("/profile",  ctrl.updateProfile);

// Health
router.get("/health", (_req, res) =>
  res.json({ success: true, data: { message: "Staff API OK" } })
);

module.exports = router;
