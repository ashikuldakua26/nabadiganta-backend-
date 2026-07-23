const mongoose = require("mongoose");

function calculateLoanBalance(principalAmount, paidAmount = 0) {
  const parsedPrincipal = Number(principalAmount) || 0;
  const parsedPaidAmount = Number(paidAmount) || 0;
  const normalizedPaidAmount = Math.min(parsedPaidAmount, parsedPrincipal);
  const outstandingAmount = Math.max(0, parsedPrincipal - normalizedPaidAmount);

  return {
    principalAmount: parsedPrincipal,
    paidAmount: normalizedPaidAmount,
    outstandingAmount,
    isCompleted: outstandingAmount === 0 && parsedPrincipal > 0,
  };
}

function applyLoanPayment(currentLoan, paymentAmount) {
  const parsedPaymentAmount = Number(paymentAmount) || 0;
  const currentPaidAmount = Number(currentLoan?.paidAmount || 0);
  const principalAmount = Number(currentLoan?.amount || currentLoan?.principalAmount || 0);
  const remainingBalance = Math.max(0, principalAmount - currentPaidAmount);
  const appliedAmount = Math.min(parsedPaymentAmount, remainingBalance);
  const nextPaidAmount = currentPaidAmount + appliedAmount;
  const balance = calculateLoanBalance(principalAmount, nextPaidAmount);

  return {
    ...balance,
    paidAmount: nextPaidAmount,
    appliedAmount,
    remainingAmount: Math.max(0, parsedPaymentAmount - appliedAmount),
    status: balance.isCompleted ? "completed" : "active",
  };
}

/**
 * Split a loan payment into profit (interest) and principal portions.
 * Payment is applied to profit first, then principal.
 */
function calculateLoanRepayment(loan, paymentAmount) {
  const totalPayable   = Number(loan.totalPayable || loan.amount || 0);
  const profitPaid     = Number(loan.profitPaid || 0);
  const principalPaid  = Number(loan.principalPaid || 0);
  const totalPaid      = profitPaid + principalPaid;
  const remaining      = Math.max(0, totalPayable - totalPaid);

  if (remaining <= 0 || Number(paymentAmount) <= 0) {
    return {
      appliedAmount: 0, profitPortion: 0, principalPortion: 0,
      remaining, isCompleted: true,
      newProfitPaid: profitPaid, newPrincipalPaid: principalPaid,
    };
  }

  const parsedPayment    = Number(paymentAmount) || 0;
  const profitAmount     = Number(loan.profitAmount || 0);
  const profitRemaining  = Math.max(0, profitAmount - profitPaid);

  // Profit first
  const profitPortion      = Math.min(parsedPayment, profitRemaining);
  const remainingAfterProfit = parsedPayment - profitPortion;

  // Then principal
  const principalAmount    = Number(loan.amount || 0);
  const principalRemaining = Math.max(0, principalAmount - principalPaid);
  const principalPortion   = Math.min(remainingAfterProfit, principalRemaining);

  const appliedAmount  = profitPortion + principalPortion;
  const newTotalPaid   = (profitPaid + profitPortion) + (principalPaid + principalPortion);
  const newRemaining   = Math.max(0, totalPayable - newTotalPaid);

  return {
    appliedAmount,
    profitPortion,
    principalPortion,
    remaining: newRemaining,
    isCompleted: newRemaining <= 0,
    newProfitPaid: profitPaid + profitPortion,
    newPrincipalPaid: principalPaid + principalPortion,
  };
}

// Aggregate-based helper (alias for when you have a payments array)
function aggregateLoanBalance({ loanAmount, payments = [] }) {
  const paidAmount = payments.reduce((sum, payment) => sum + Number(payment?.amount || 0), 0);
  return calculateLoanBalance(loanAmount, paidAmount);
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
    // Interest/profit fields
    interestRate: Number(transaction.interestRate ?? 0),
    profitAmount: Number(transaction.profitAmount ?? 0),
    totalPayable: Number(transaction.totalPayable ?? 0),
    profitPaid: Number(transaction.profitPaid ?? 0),
    principalPaid: Number(transaction.principalPaid ?? 0),
    profitPortion: Number(transaction.profitPortion ?? 0),
    principalPortion: Number(transaction.principalPortion ?? 0),
  };
}

module.exports = {
  calculateLoanBalance,
  applyLoanPayment,
  calculateLoanRepayment,
  aggregateLoanBalance,
  getTransactionDateField,
  buildTransactionFilter,
  normalizeFinancialTransaction,
};
