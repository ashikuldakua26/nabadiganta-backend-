const express = require("express");
const ctrl    = require("../controllers/branchManager.controller");
const { authenticate, authorize } = require("../middlewares/auth");
const { enforceBranchManagerLoginWindow } = require("../middlewares/branchLoginWindow");
const { USER_ROLES } = require("../helpers/constants");

const router = express.Router();

// ─── Wrap async handlers so unhandled rejections reach the error middleware ───
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ─── Auth + role guard ────────────────────────────────────────────────────────
router.use(authenticate);
router.use(authorize(
  USER_ROLES.BRANCH_MANAGER,
  USER_ROLES.ADMIN,
  USER_ROLES.SUPER_ADMIN
));
router.use(wrap(enforceBranchManagerLoginWindow));

// ─── Routes ───────────────────────────────────────────────────────────────────
router.get("/panel",                              wrap(ctrl.panelSummary));

router.get("/customers",                          wrap(ctrl.listCustomers));
router.post("/customers",                         wrap(ctrl.createCustomer));
router.patch("/customers/:customerId",            wrap(ctrl.updateCustomer));
router.delete("/customers/:customerId",           wrap(ctrl.deactivateCustomer));

router.post("/deposits",                          wrap(ctrl.createDeposit));
router.post("/withdrawals",                       wrap(ctrl.createWithdrawal));

router.post("/loans/apply",                       wrap(ctrl.applyLoan));
router.patch("/loans/:loanId/status",             wrap(ctrl.updateLoanStatus));
router.post("/loans/:loanId/payments",            wrap(ctrl.recordLoanPayment));
router.get("/loans",                              wrap(ctrl.listLoans));

router.get("/funds",                              wrap(ctrl.getFunds));
router.get("/transactions",                       wrap(ctrl.getTransactions));

router.post("/messages",                          wrap(ctrl.sendMessage));

router.get("/reports/daily",                      wrap(ctrl.getDailyReport));
router.get("/reports/monthly",                    wrap(ctrl.getMonthlyReport));

module.exports = router;
