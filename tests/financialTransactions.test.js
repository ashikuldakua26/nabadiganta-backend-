const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateLoanBalance, getTransactionDateField, buildTransactionFilter, normalizeFinancialTransaction } = require("../helpers/financialTransactions");

test("calculateLoanBalance returns outstanding balance from principal and paid amount", () => {
  const balance = calculateLoanBalance(1000, 500);

  assert.equal(balance.paidAmount, 500);
  assert.equal(balance.outstandingAmount, 500);
  assert.equal(balance.isCompleted, false);
});

test("calculateLoanBalance marks a loan as completed when fully paid", () => {
  const balance = calculateLoanBalance(600, 600);

  assert.equal(balance.paidAmount, 600);
  assert.equal(balance.outstandingAmount, 0);
  assert.equal(balance.isCompleted, true);
});

test("getTransactionDateField returns the correct date field for each transaction type", () => {
  assert.equal(getTransactionDateField("deposit"), "collectedAt");
  assert.equal(getTransactionDateField("loan"), "appliedAt");
  assert.equal(getTransactionDateField("loan_payment"), "paidAt");
  assert.equal(getTransactionDateField("withdrawal"), "withdrawnAt");
});

test("buildTransactionFilter applies type, status, and date filters to the unified model", () => {
  const from = new Date("2024-01-01T00:00:00.000Z");
  const to = new Date("2024-01-31T23:59:59.999Z");
  const branchId = "507f1f77bcf86cd799439011";
  const customerId = "507f1f77bcf86cd799439012";

  const match = buildTransactionFilter({
    type: "loan",
    branchId,
    customerId,
    status: "passed",
    from,
    to,
  });

  assert.equal(match.type, "loan");
  assert.equal(String(match.branch), branchId);
  assert.equal(String(match.customer), customerId);
  assert.equal(match.status, "passed");
  assert.deepEqual(match.appliedAt, { $gte: from, $lte: to });
});

test("normalizeFinancialTransaction maps the unified model into an app-friendly payload", () => {
  const normalized = normalizeFinancialTransaction({
    _id: "transaction-123",
    type: "deposit",
    amount: 500,
    customer: { name: "Rahim", phone: "01700000000" },
    branch: { name: "Dhanmondi" },
    note: "weekly deposit",
    collectedAt: new Date("2024-01-20T00:00:00.000Z"),
  });

  assert.equal(normalized.id, "transaction-123");
  assert.equal(normalized.type, "deposit");
  assert.equal(normalized.amount, 500);
  assert.equal(normalized.customerName, "Rahim");
  assert.equal(normalized.branchName, "Dhanmondi");
  assert.equal(normalized.note, "weekly deposit");
});
