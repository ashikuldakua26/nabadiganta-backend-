const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeFinancialTransaction } = require("../helpers/financialTransactions");

test("normalizeFinancialTransaction maps deposits into branch-friendly payloads", () => {
  const payload = normalizeFinancialTransaction({
    _id: "dep-1",
    amount: 5000,
    note: "Saved weekly",
    customer: { name: "Rahim", phone: "01700000000" },
    branch: { name: "Main Branch" },
    collectedAt: "2026-07-07T10:30:00.000Z",
    type: "deposit",
  });

  assert.equal(payload.type, "deposit");
  assert.equal(payload.amount, 5000);
  assert.equal(payload.customerName, "Rahim");
  assert.equal(payload.branchName, "Main Branch");
  assert.equal(payload.note, "Saved weekly");
});

test("normalizeFinancialTransaction keeps loan payment context", () => {
  const payload = normalizeFinancialTransaction({
    _id: "payment-1",
    amount: 2500,
    customer: { name: "Karim" },
    branch: { name: "North Branch" },
    loan: "loan-123",
    paidAt: "2026-07-06T08:00:00.000Z",
    type: "loan_payment",
  });

  assert.equal(payload.type, "loan_payment");
  assert.equal(payload.loan, "loan-123");
  assert.equal(payload.customerName, "Karim");
  assert.equal(payload.branchName, "North Branch");
});
