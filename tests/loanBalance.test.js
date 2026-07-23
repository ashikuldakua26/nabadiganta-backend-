const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateLoanBalance, applyLoanPayment } = require("../helpers/financialTransactions");

test("calculateLoanBalance returns outstanding balance from principal and paid amount", () => {
  const balance = calculateLoanBalance(1000, 250);

  assert.equal(balance.principalAmount, 1000);
  assert.equal(balance.paidAmount, 250);
  assert.equal(balance.outstandingAmount, 750);
  assert.equal(balance.isCompleted, false);
});

test("applyLoanPayment updates the loan balance and completes it when fully paid", () => {
  const updated = applyLoanPayment({ amount: 1000, paidAmount: 600 }, 400);

  assert.equal(updated.paidAmount, 1000);
  assert.equal(updated.outstandingAmount, 0);
  assert.equal(updated.isCompleted, true);
  assert.equal(updated.status, "completed");
});

test("applyLoanPayment caps payments to the remaining balance and reports any excess", () => {
  const updated = applyLoanPayment({ amount: 1000, paidAmount: 600 }, 800);

  assert.equal(updated.paidAmount, 1000);
  assert.equal(updated.outstandingAmount, 0);
  assert.equal(updated.appliedAmount, 400);
  assert.equal(updated.remainingAmount, 400);
  assert.equal(updated.isCompleted, true);
});
