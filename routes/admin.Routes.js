const express = require("express");
const adminController = require("../controllers/admin.controller");
const { authenticate, authorize } = require("../middlewares/auth");
const { USER_ROLES } = require("../helpers/constants");

const router = express.Router();

router.use(authenticate);
router.use(authorize(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN));

router.get("/meta", adminController.getMeta);
router.get("/settings", adminController.getSettings);
router.patch("/settings", adminController.updateSettings);
router.get("/dashboard/summary", adminController.getDashboardSummary);
router.get("/branches", adminController.listBranches);
router.post("/branches", adminController.createBranch);
router.patch("/branches/:branchId", adminController.updateBranch);
router.delete("/branches/:branchId", adminController.deleteBranch);
router.get("/branch-admins", adminController.listBranchAdmins);
router.post("/branch-admins", adminController.createBranchAdmin);
router.patch("/branch-admins/:userId", adminController.updateBranchAdmin);
router.delete("/branch-admins/:userId", adminController.deleteBranchAdmin);
router.get("/users", adminController.listUsers);
router.get("/customers", adminController.listBranchCustomers);
router.get("/users/:userId/summary", adminController.getUserSummary);
router.get("/users/:userId", adminController.getUserDetails);
router.post("/users/:userId/withdrawals", adminController.createUserWithdrawal);
router.post("/users/:userId/loan-payments", adminController.createUserLoanPayment);
router.post("/users", adminController.createUser);
router.patch("/users/:userId", adminController.updateUser);
router.delete("/users/:userId", adminController.deleteUser);
router.patch("/users/:userId/kyc", adminController.updateUserKyc);
router.get("/transactions/totals", adminController.getTransactionTotals);
router.get("/transactions", adminController.getTransactions);
router.get("/transactions/:transactionId/audit-logs", adminController.getTransactionAuditLogs);
router.get("/transactions/:transactionId", adminController.getTransactionById);
router.post("/transactions", adminController.createTransaction);
router.patch("/transactions/:transactionId", adminController.updateTransaction);
router.delete("/transactions/:transactionId", adminController.deleteTransaction);
router.get("/dashboard/branch-performance", adminController.getBranchPerformance);
router.get("/loans", adminController.listLoans);
router.patch("/loans/:loanId/status", adminController.updateLoanStatus);
router.get("/system/audit-logs", adminController.listAuditLogs);
router.get("/system/export-data", adminController.exportSystemData);

module.exports = router;

