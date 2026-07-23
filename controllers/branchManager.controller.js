const Branch = require("../models/Branch");
const Customer = require("../models/Customer");
const Message = require("../models/Message");
const { USER_ROLES } = require("../helpers/constants");
const { getPagination, isPositiveAmount, normalizePhone } = require("../helpers/validators");
const { getTodayRange, getMonthRange } = require("../helpers/date");
const { buildBranchManagerTransaction } = require("../helpers/transactions");
const { applyLoanPayment } = require("../helpers/loanBalance");
const FinancialTransaction = require("../models/FinancialTransaction");
const { buildTransactionFilter, getTransactionDateField, normalizeFinancialTransaction } = require("../helpers/financialTransactions");
const mongoose = require("mongoose");

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Always returns a valid Date — now if input is missing or invalid */
function getTransactionDate(raw) {
  if (!raw) return new Date();
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date() : d;
}

function getBranchId(req) {
  // Branch managers always use their token-assigned branch
  if (req.user?.role === USER_ROLES.BRANCH_MANAGER) {
    return req.user?.branchId ? req.user.branchId.toString() : null;
  }

  // Admin/superadmin may override via body or query
  const override = req.body?.branchId || req.body?.branch ||
                   req.query?.branchId || req.query?.branch;
  if (override) {
    if (typeof override === "object" && override !== null) {
      return override._id ? override._id.toString() : null;
    }
    return override.toString();
  }

  // Fall back to token's branchId
  return req.user?.branchId ? req.user.branchId.toString() : null;
}

function toObjectId(value) {
  if (!value) return null;

  // Populated object: { _id: "...", name: "..." }
  if (typeof value === "object" && !(value instanceof mongoose.Types.ObjectId)) {
    value = value._id ? value._id.toString() : null;
    if (!value) return null;
  }

  if (value instanceof mongoose.Types.ObjectId) return value;

  const str = value.toString();
  if (!mongoose.Types.ObjectId.isValid(str)) return null;
  return new mongoose.Types.ObjectId(str);
}

async function panelSummary(req, res) {
  try {
    const branchId = toObjectId(getBranchId(req));
    if (!branchId) {
      return res.status(403).json({ message: "Branch not selected for user" });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const depositDateField = getTransactionDateField("deposit");

    const [branch, customerCount, todayDepositAgg, appliedLoans, passedLoans] = await Promise.all([
      Branch.findById(branchId),
      Customer.countDocuments({ branch: branchId, isActive: true }),
      FinancialTransaction.aggregate([
        {
          $match: {
            type: "deposit",
            branch: branchId,
            [depositDateField]: {
              $gte: today,
            },
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      FinancialTransaction.countDocuments({ type: "loan", branch: branchId, status: "applied" }),
      FinancialTransaction.countDocuments({ type: "loan", branch: branchId, status: "passed" }),
    ]);

    return res.json({
      panel: {
        branch,
        customerCount,
        todayDeposit: todayDepositAgg[0]?.total || 0,
        appliedLoans,
        passedLoans,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function createCustomer(req, res) {
  try {
    const branchId = toObjectId(getBranchId(req));
    const { name, phone, area } = req.body;
    if (!branchId) {
      return res.status(403).json({ success: false, message: "Branch not assigned to this account" });
    }
    if (!name || !phone || !area) {
      return res.status(400).json({ success: false, message: "name, phone and area are required" });
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return res.status(400).json({ success: false, message: "Invalid phone number format" });
    }

    const existingCustomer = await Customer.findOne({ phone: normalizedPhone, branch: branchId });
    if (existingCustomer) {
      if (!existingCustomer.isActive) {
        // Reactivate if previously deactivated
        existingCustomer.isActive = true;
        existingCustomer.name = name.trim();
        existingCustomer.area = area.trim().toLowerCase();
        await existingCustomer.save();
        return res.status(200).json({ success: true, message: "Customer reactivated", customer: existingCustomer });
      }
      return res.status(409).json({ success: false, message: "A customer with this phone already exists in this branch" });
    }

    const customer = await Customer.create({
      name:      name.trim(),
      phone:     normalizedPhone,
      area:      area.trim().toLowerCase(),
      branch:    branchId,
      createdBy: req.user.id,
    });

    return res.status(201).json({ success: true, message: "Customer added successfully", customer });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

async function listCustomers(req, res) {
  try {
    const branchId = toObjectId(getBranchId(req));
    if (!branchId) {
      return res.status(403).json({ message: "Branch not assigned to this account. Contact your admin." });
    }

    const area = req.query.area;
    const queryText = String(req.query.q || "").trim();
    const { page, limit, skip } = getPagination(req.query, 20, 200);

    const query = { branch: branchId, isActive: true };
    if (area) {
      query.area = area.toLowerCase();
    }

    if (queryText) {
      const escapedText = queryText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const searchRegex = new RegExp(escapedText, "i");
      const digitsOnly = String(queryText || "").replace(/\D+/g, "");
      query.$or = [
        { name: searchRegex },
        { phone: searchRegex },
        { area: searchRegex },
      ];
      if (digitsOnly) {
        query.$or.push({ phone: new RegExp(digitsOnly) });
      }
    }

    const [customers, total] = await Promise.all([
      Customer.find(query)
        .select("name phone area isActive createdAt")
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Customer.countDocuments(query),
    ]);

    return res.json({
      success: true,
      customers,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

async function updateCustomer(req, res) {
  try {
    const branchId = toObjectId(getBranchId(req));
    const { customerId } = req.params;
    const { name, phone, area, isActive } = req.body;
    const update = {};

    if (!branchId) {
      return res.status(403).json({ message: "Branch not selected for user" });
    }

    if (name !== undefined) {
      const nextName = String(name).trim();
      if (!nextName) {
        return res.status(400).json({ message: "name cannot be empty" });
      }
      update.name = nextName;
    }

    if (phone !== undefined) {
      const normalizedPhone = normalizePhone(phone);
      if (!normalizedPhone) {
        return res.status(400).json({ message: "phone is required" });
      }

      const existing = await Customer.findOne({
        phone: normalizedPhone,
        branch: branchId,
        _id: { $ne: customerId },
      });

      if (existing) {
        return res.status(409).json({ message: "Customer with this phone already exists in this branch" });
      }

      update.phone = normalizedPhone;
    }

    if (area !== undefined) {
      const nextArea = String(area).trim().toLowerCase();
      if (!nextArea) {
        return res.status(400).json({ message: "area cannot be empty" });
      }
      update.area = nextArea;
    }

    if (isActive !== undefined) {
      update.isActive = Boolean(isActive);
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    const customer = await Customer.findOneAndUpdate({ _id: customerId, branch: branchId }, update, { new: true });
    if (!customer) {
      return res.status(404).json({ message: "Customer not found in this branch" });
    }

    return res.json({ message: "Customer updated", customer });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function deactivateCustomer(req, res) {
  try {
    const branchId = toObjectId(getBranchId(req));
    const { customerId } = req.params;

    if (!branchId) {
      return res.status(403).json({ message: "Branch not selected for user" });
    }

    const customer = await Customer.findOne({ _id: customerId, branch: branchId });
    if (!customer) {
      return res.status(404).json({ message: "Customer not found in this branch" });
    }

    customer.isActive = false;
    await customer.save();

    return res.json({ message: "Customer removed from active list" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function createDeposit(req, res) {
  try {
    const branchId = toObjectId(getBranchId(req));
    const { customerId, amount, note } = req.body;
    if (!branchId || !customerId || !amount) {
      return res.status(400).json({ message: "branch, customerId, amount are required" });
    }

    if (!isPositiveAmount(amount)) {
      return res.status(400).json({ message: "amount must be a positive number" });
    }

    const customer = await Customer.findOne({ _id: customerId, branch: branchId, isActive: true });
    if (!customer) {
      return res.status(404).json({ message: "Customer not found in this branch" });
    }

    const deposit = await FinancialTransaction.create({
      type: "deposit",
      branch: branchId,
      customer: customerId,
      amount,
      note: note || "",
      createdBy: req.user.id,
      transactionDate: getTransactionDate(req.body.collectedAt),
      collectedAt: getTransactionDate(req.body.collectedAt),
    });

    return res.status(201).json({ message: "Deposit collected", deposit });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function createWithdrawal(req, res) {
  try {
    const branchId = toObjectId(getBranchId(req));
    const { customerId, amount, note } = req.body;
    if (!branchId || !customerId || !amount) {
      return res.status(400).json({ message: "branch, customerId, amount are required" });
    }

    if (!isPositiveAmount(amount)) {
      return res.status(400).json({ message: "amount must be a positive number" });
    }

    const customer = await Customer.findOne({ _id: customerId, branch: branchId, isActive: true });
    if (!customer) {
      return res.status(404).json({ message: "Customer not found in this branch" });
    }

    const withdrawal = await FinancialTransaction.create({
      type: "withdrawal",
      branch: branchId,
      customer: customerId,
      amount,
      note: note || "",
      createdBy: req.user.id,
      transactionDate: getTransactionDate(req.body.transactionDate),
    });

    return res.status(201).json({ message: "Withdrawal recorded", withdrawal });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function applyLoan(req, res) {
  try {
    const branchId = toObjectId(getBranchId(req));
    const { customerId, amount, note } = req.body;
    if (!branchId || !customerId || !amount) {
      return res.status(400).json({ message: "branch, customerId, amount are required" });
    }

    if (!isPositiveAmount(amount)) {
      return res.status(400).json({ message: "amount must be a positive number" });
    }

    const customer = await Customer.findOne({ _id: customerId, branch: branchId, isActive: true });
    if (!customer) {
      return res.status(404).json({ message: "Customer not found in this branch" });
    }

    const loan = await FinancialTransaction.create({
      type: "loan",
      branch: branchId,
      customer: customerId,
      amount,
      note: note || "",
      status: "applied",
      createdBy: req.user.id,
      transactionDate: getTransactionDate(req.body.appliedAt),
      appliedAt: getTransactionDate(req.body.appliedAt),
    });

    return res.status(201).json({ message: "Loan applied", loan });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updateLoanStatus(req, res) {
  try {
    const { loanId } = req.params;
    const { status } = req.body;

    if (!["passed", "absent", "rejected"].includes(status)) {
      return res.status(400).json({ message: "status must be passed, absent or rejected" });
    }

    const loan = await FinancialTransaction.findOneAndUpdate(
      { _id: loanId, type: "loan" },
      {
        status,
        approvedBy: req.user.id,
        transactionDate: new Date(),
        appliedAt: new Date(),
      },
      { new: true }
    );

    if (!loan) {
      return res.status(404).json({ message: "Loan not found" });
    }

    return res.json({ message: "Loan status updated", loan });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function listLoans(req, res) {
  try {
    const branchId = toObjectId(getBranchId(req));
    const status = req.query.status;
    const { page, limit, skip } = getPagination(req.query, 20, 100);

    const query = { branch: branchId };
    if (status) {
      query.status = status;
    }

    const [loans, total] = await Promise.all([
      FinancialTransaction.find({ ...query, type: "loan" })
        .populate("customer", "name")
        .populate("createdBy", "name")
        .populate("approvedBy", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      FinancialTransaction.countDocuments({ ...query, type: "loan" }),
    ]);

    const loansWithBalance = loans.map((loan) => ({
      ...loan,
      outstandingAmount: Number(loan.outstandingAmount ?? loan.amount ?? 0),
      paidAmount: Number(loan.paidAmount ?? 0),
      balanceStatus: loan.balanceStatus || (Number(loan.outstandingAmount ?? loan.amount ?? 0) === 0 ? "completed" : "active"),
    }));

    return res.json({ loans: loansWithBalance, pagination: { page, limit, total } });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function recordLoanPayment(req, res) {
  try {
    const branchId = toObjectId(getBranchId(req));
    const { loanId } = req.params;
    const { customerId, amount, note } = req.body;

    if (!branchId || !loanId || !customerId || !amount) {
      return res.status(400).json({ message: "branch, loanId, customerId and amount are required" });
    }

    if (!isPositiveAmount(amount)) {
      return res.status(400).json({ message: "amount must be a positive number" });
    }

    const customer = await Customer.findOne({ _id: customerId, branch: branchId, isActive: true });
    if (!customer) {
      return res.status(404).json({ message: "Customer not found in this branch" });
    }

    const loan = await FinancialTransaction.findOne({ _id: loanId, type: "loan", branch: branchId, customer: customerId });
    if (!loan) {
      return res.status(404).json({ message: "Loan not found for this customer in this branch" });
    }

    const paymentPlan = applyLoanPayment(loan, amount);
    if (paymentPlan.appliedAmount <= 0) {
      return res.status(400).json({ message: "Loan already has no outstanding balance" });
    }

    const payment = await FinancialTransaction.create({
      type: "loan_payment",
      loan: loan._id,
      customer: customer._id,
      branch: branchId,
      amount: paymentPlan.appliedAmount,
      note: note || "",
      createdBy: req.user.id,
      transactionDate: getTransactionDate(req.body.paidAt),
      paidAt: getTransactionDate(req.body.paidAt),
    });

    const updatedLoan = await FinancialTransaction.findById(loan._id).lean();

    return res.status(201).json({
      message: paymentPlan.remainingAmount > 0 ? "Loan payment recorded and excess amount was capped to the remaining balance" : "Loan payment recorded",
      payment,
      loan: updatedLoan,
      appliedAmount: paymentPlan.appliedAmount,
      remainingAmount: paymentPlan.remainingAmount,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getFunds(req, res) {
  try {
    const branchId = toObjectId(getBranchId(req));
    const [depositAgg, outstandingLoanAgg] = await Promise.all([
      FinancialTransaction.aggregate([
        { $match: { type: "deposit", branch: branchId } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      FinancialTransaction.aggregate([
        { $match: { type: "loan", branch: branchId, status: "passed" } },
        { $group: { _id: null, totalOutstanding: { $sum: "$outstandingAmount" } } },
      ]),
    ]);

    const totalDeposit = depositAgg[0]?.total || 0;
    const totalOutstandingLoans = outstandingLoanAgg[0]?.totalOutstanding || 0;

    return res.json({
      funds: {
        totalDeposit,
        totalOutstandingLoans,
        netAvailable: Math.max(0, totalDeposit - totalOutstandingLoans),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getTransactions(req, res) {
  try {
    const branchId = toObjectId(getBranchId(req));
    const { limit } = getPagination(req.query, 25, 100);
    const match = buildTransactionFilter({ branchId, queryText: String(req.query.q || "").trim() });

    // Optional type filter
    if (req.query.type) {
      match.type = req.query.type;
    }

    const transactions = await FinancialTransaction.find(match)
      .populate("customer", "name")
      .populate("branch", "name")
      .populate("createdBy", "name phone role")
      .populate("approvedBy", "name phone role")
      .sort({ transactionDate: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({
      transactions: transactions.map(normalizeFinancialTransaction).sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0)),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function sendMessage(req, res) {
  try {
    const branchId = toObjectId(getBranchId(req));
    const { customerId, type, body } = req.body;

    if (!customerId || !type || !body) {
      return res.status(400).json({ message: "customerId, type, body are required" });
    }

    if (!["deposit", "loan"].includes(type)) {
      return res.status(400).json({ message: "Only deposit and loan message types are allowed" });
    }

    const customer = await Customer.findOne({ _id: customerId, branch: branchId, isActive: true });
    if (!customer) {
      return res.status(404).json({ message: "Customer not found in this branch" });
    }

    const message = await Message.create({
      customer: customerId,
      branch: branchId,
      sentBy: req.user.id,
      type,
      body,
    });

    return res.status(201).json({ message: "Message sent", data: message });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getDailyReport(req, res) {
  try {
    const branchId = toObjectId(getBranchId(req));
    if (!branchId) {
      return res.status(403).json({ message: "Branch not selected for user" });
    }

    const today = getTodayRange();
    const depositDateField = getTransactionDateField("deposit");
    const loanDateField = getTransactionDateField("loan");
    const [todayDepositAgg, todayLoanApply, todayLoanPass, todayLoanAbsent] = await Promise.all([
      FinancialTransaction.aggregate([
        { $match: { type: "deposit", branch: branchId, [depositDateField]: { $gte: today.start, $lt: today.end } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      FinancialTransaction.countDocuments({ type: "loan", branch: branchId, [loanDateField]: { $gte: today.start, $lt: today.end }, status: "applied" }),
      FinancialTransaction.countDocuments({ type: "loan", branch: branchId, status: "passed", [loanDateField]: { $gte: today.start, $lt: today.end } }),
      FinancialTransaction.countDocuments({ type: "loan", branch: branchId, status: "absent", [loanDateField]: { $gte: today.start, $lt: today.end } }),
    ]);

    return res.json({
      report: {
        period: "daily",
        todayDeposit: todayDepositAgg[0]?.total || 0,
        todayLoanApply,
        todayLoanPass,
        todayLoanAbsent,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getMonthlyReport(req, res) {
  try {
    const branchId = toObjectId(getBranchId(req));
    if (!branchId) {
      return res.status(403).json({ message: "Branch not selected for user" });
    }

    const month = getMonthRange();
    const depositDateField = getTransactionDateField("deposit");
    const loanDateField = getTransactionDateField("loan");
    const [monthDepositAgg, monthLoanPass, monthLoanApply] = await Promise.all([
      FinancialTransaction.aggregate([
        { $match: { type: "deposit", branch: branchId, [depositDateField]: { $gte: month.start, $lt: month.end } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      FinancialTransaction.countDocuments({ type: "loan", branch: branchId, status: "passed", [loanDateField]: { $gte: month.start, $lt: month.end } }),
      FinancialTransaction.countDocuments({ type: "loan", branch: branchId, status: "applied", [loanDateField]: { $gte: month.start, $lt: month.end } }),
    ]);

    return res.json({
      report: {
        period: "monthly",
        monthDepositIn: monthDepositAgg[0]?.total || 0,
        monthLoanPass,
        monthLoanApply,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  panelSummary,
  createCustomer,
  listCustomers,
  updateCustomer,
  deactivateCustomer,
  createDeposit,
  createWithdrawal,
  applyLoan,
  recordLoanPayment,
  updateLoanStatus,
  listLoans,
  getFunds,
  getTransactions,
  sendMessage,
  getDailyReport,
  getMonthlyReport,
};
