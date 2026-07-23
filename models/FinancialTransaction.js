const mongoose = require("mongoose");
const { calculateLoanBalance } = require("../helpers/financialTransactions");

async function syncLoanBalance(loanId) {
  if (!loanId) return;

  const FinancialTransaction = mongoose.model("FinancialTransaction");
  const [loanDoc, paymentDocs] = await Promise.all([
    FinancialTransaction.findOne({ _id: loanId, type: "loan" }),
    FinancialTransaction.find({ type: "loan_payment", loan: loanId }),
  ]);

  if (!loanDoc) return;

  const totalPaid = paymentDocs.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const profitPaid = paymentDocs.reduce((sum, payment) => sum + Number(payment.profitPortion || 0), 0);
  const principalPaid = paymentDocs.reduce((sum, payment) => sum + Number(payment.principalPortion || 0), 0);
  const totalPayable = Math.max(Number(loanDoc.totalPayable || loanDoc.amount || 0), 0);
  const outstandingAmount = Math.max(0, totalPayable - totalPaid);
  const balanceStatus = outstandingAmount === 0 && totalPayable > 0 ? "completed" : "active";

  await FinancialTransaction.updateOne(
    { _id: loanId, type: "loan" },
    {
      paidAmount: totalPaid,
      outstandingAmount,
      balanceStatus,
      profitPaid,
      principalPaid,
    }
  );
}

const financialTransactionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["deposit", "loan", "loan_payment", "withdrawal"],
      required: true,
      index: true,
    },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    note: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["applied", "passed", "absent", "rejected"],
      default: null,
      index: true,
    },
    loan: { type: mongoose.Schema.Types.ObjectId, ref: "FinancialTransaction", default: null, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    transactionDate: { type: Date, default: Date.now, index: true },
    collectedAt: { type: Date, default: null, index: true },
    appliedAt: { type: Date, default: null, index: true },
    paidAt: { type: Date, default: null, index: true },
    withdrawnAt: { type: Date, default: null, index: true },

    // ─── Loan Balance ─────────────────────────────────────────────────────────
    paidAmount: { type: Number, default: 0, min: 0 },
    outstandingAmount: { type: Number, default: 0, min: 0 },
    balanceStatus: {
      type: String,
      enum: ["active", "completed"],
      default: "active",
      index: true,
    },

    // ─── Interest / Profit Tracking (only for type="loan") ────────────────────
    interestRate:  { type: Number, default: 0, min: 0 },     // e.g. 10 = 10%
    profitAmount:  { type: Number, default: 0, min: 0 },     // interestRate% of principal
    totalPayable:  { type: Number, default: 0, min: 0 },     // amount + profitAmount
    profitPaid:    { type: Number, default: 0, min: 0 },     // how much profit collected
    principalPaid: { type: Number, default: 0, min: 0 },     // how much principal collected
    profitPortion: { type: Number, default: 0, min: 0 },     // for loan_payment: profit portion
    principalPortion: { type: Number, default: 0, min: 0 },  // for loan_payment: principal portion
  },
  { timestamps: true }
);

financialTransactionSchema.pre("save", async function () {
  const transactionDate = this.transactionDate || new Date();
  const effectiveDate = this.transactionDate || this.collectedAt || this.appliedAt || this.paidAt || this.withdrawnAt || transactionDate;

  this.transactionDate = effectiveDate;
  this.collectedAt = this.type === "deposit" ? effectiveDate : this.collectedAt || null;
  this.appliedAt = this.type === "loan" ? effectiveDate : this.appliedAt || null;
  this.paidAt = this.type === "loan_payment" ? effectiveDate : this.paidAt || null;
  this.withdrawnAt = this.type === "withdrawal" ? effectiveDate : this.withdrawnAt || null;

  if (this.type === "loan") {
    this.interestRate = Number(this.interestRate || 0);
    this.profitAmount = Math.round(Number(this.amount || 0) * this.interestRate / 100);
    this.totalPayable = Number(this.amount || 0) + this.profitAmount;
    this.paidAmount = 0;
    this.outstandingAmount = this.totalPayable;
    this.balanceStatus = "active";
    this.profitPaid = 0;
    this.principalPaid = 0;
  }

  if (this.type === "loan_payment") {
    // syncLoanBalance (post-save) recalculates the parent loan
  }
});

financialTransactionSchema.post("save", async function () {
  if (this.type === "loan_payment" && this.loan) {
    await syncLoanBalance(this.loan);
  }
  if (this.type === "loan") {
    await syncLoanBalance(this._id);
  }
});

financialTransactionSchema.post("findOneAndDelete", async function (doc) {
  if (doc?.type === "loan_payment" && doc.loan) {
    await syncLoanBalance(doc.loan);
  }
});

module.exports = mongoose.model("FinancialTransaction", financialTransactionSchema);
