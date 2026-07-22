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
  const outstandingAmount = Math.max(0, Number(loanDoc.amount || 0) - totalPaid);
  const balanceStatus = outstandingAmount === 0 && Number(loanDoc.amount || 0) > 0 ? "completed" : "active";

  await FinancialTransaction.updateOne(
    { _id: loanId, type: "loan" },
    {
      paidAmount: totalPaid,
      outstandingAmount,
      balanceStatus,
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
    paidAmount: { type: Number, default: 0, min: 0 },
    outstandingAmount: { type: Number, default: 0, min: 0 },
    balanceStatus: {
      type: String,
      enum: ["active", "completed"],
      default: "active",
      index: true,
    },
    loanPaidAmount: { type: Number, default: 0, min: 0 },
    loanOutstandingAmount: { type: Number, default: 0, min: 0 },
    loanBalanceStatus: {
      type: String,
      enum: ["active", "completed"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true }
);

financialTransactionSchema.pre("save", function (next) {
  const transactionDate = this.transactionDate || new Date();
  const effectiveDate = this.transactionDate || this.collectedAt || this.appliedAt || this.paidAt || this.withdrawnAt || transactionDate;

  this.transactionDate = effectiveDate;
  this.collectedAt = this.type === "deposit" ? effectiveDate : this.collectedAt || null;
  this.appliedAt = this.type === "loan" ? effectiveDate : this.appliedAt || null;
  this.paidAt = this.type === "loan_payment" ? effectiveDate : this.paidAt || null;
  this.withdrawnAt = this.type === "withdrawal" ? effectiveDate : this.withdrawnAt || null;

  if (this.type === "loan") {
    this.paidAmount = 0;
    this.outstandingAmount = Number(this.amount || 0);
    this.balanceStatus = "active";
  }

  if (this.type === "loan_payment") {
    const paymentBalance = calculateLoanBalance({
      loanAmount: Number(this.amount || 0),
      payments: [{ amount: this.amount }],
    });
    this.paidAmount = paymentBalance.paidAmount;
    this.outstandingAmount = paymentBalance.outstandingAmount;
    this.balanceStatus = paymentBalance.balanceStatus;
  }

  if (this.type === "loan" || this.type === "loan_payment") {
    const balance = calculateLoanBalance({
      loanAmount: this.type === "loan" ? this.amount : Number(this.amount || 0),
      payments: this.type === "loan_payment" ? [{ amount: this.amount }] : [],
    });
    this.loanPaidAmount = this.type === "loan_payment" ? balance.paidAmount : 0;
    this.loanOutstandingAmount = this.type === "loan_payment" ? balance.outstandingAmount : this.amount;
    this.loanBalanceStatus = this.type === "loan_payment" ? balance.balanceStatus : "active";
  }

  next();
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
