const mongoose = require("mongoose");

function calculateLoanBalance({ loanAmount, payments = [] }) {
  const principalAmount = Number(loanAmount || 0);
  const paidAmount = payments.reduce((sum, payment) => sum + Number(payment?.amount || 0), 0);
  const outstandingAmount = Math.max(0, principalAmount - paidAmount);

  return {
    paidAmount,
    outstandingAmount,
    balanceStatus: outstandingAmount === 0 && principalAmount > 0 ? "completed" : "active",
  };
}

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(value)) return new mongoose.Types.ObjectId(value);
  return null;
}

function getTransactionDateField(type) {
  switch (type) {
    case "deposit":
      return "collectedAt";
    case "loan":
      return "appliedAt";
    case "loan_payment":
      return "paidAt";
    case "withdrawal":
      return "withdrawnAt";
    default:
      return "transactionDate";
  }
}

function buildTransactionFilter({ type, branchId, customerId, loanId, status, from, to, queryText } = {}) {
  const match = {};

  if (type) {
    match.type = type;
  }

  const resolvedBranchId = toObjectId(branchId);
  if (resolvedBranchId) {
    match.branch = resolvedBranchId;
  }

  const resolvedCustomerId = toObjectId(customerId);
  if (resolvedCustomerId) {
    match.customer = resolvedCustomerId;
  }

  const resolvedLoanId = toObjectId(loanId);
  if (resolvedLoanId && type === "loan_payment") {
    match.loan = resolvedLoanId;
  }

  if (type === "loan" && status) {
    match.status = status;
  }

  if (from || to) {
    const dateField = getTransactionDateField(type);
    const range = {};

    if (from) {
      range.$gte = from;
    }

    if (to) {
      const toDateValue = new Date(to);
      toDateValue.setUTCHours(23, 59, 59, 999);
      range.$lte = toDateValue;
    }

    if (Object.keys(range).length) {
      match[dateField] = range;
    }
  }

  if (queryText) {
    const regex = new RegExp(queryText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const or = [{ note: regex }];

    if (mongoose.Types.ObjectId.isValid(queryText)) {
      or.push({ _id: new mongoose.Types.ObjectId(queryText) });
      or.push({ customer: new mongoose.Types.ObjectId(queryText) });
    }

    match.$or = or;
  }

  return match;
}

function normalizeFinancialTransaction(transaction = {}) {
  const transactionDate = transaction.transactionDate || transaction.collectedAt || transaction.appliedAt || transaction.paidAt || transaction.withdrawnAt || transaction.createdAt;

  return {
    id: transaction._id || transaction.id,
    _id: transaction._id,
    type: transaction.type,
    amount: Number(transaction.amount || 0),
    customer: transaction.customer,
    customerName: transaction.customerName || transaction.customer?.name || "Customer",
    customerPhone: transaction.customerPhone || transaction.customer?.phone || "",
    branch: transaction.branch,
    branchName: transaction.branchName || transaction.branch?.name || "N/A",
    createdBy: transaction.createdBy || null,
    approvedBy: transaction.approvedBy || null,
    note: transaction.note || "",
    status: transaction.status || "",
    loan: transaction.loan || "",
    at: transactionDate,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
    paidAmount: Number(transaction.paidAmount ?? 0),
    outstandingAmount: Number(transaction.outstandingAmount ?? 0),
    balanceStatus: transaction.balanceStatus || "active",
  };
}

module.exports = {
  calculateLoanBalance,
  getTransactionDateField,
  buildTransactionFilter,
  normalizeFinancialTransaction,
};
