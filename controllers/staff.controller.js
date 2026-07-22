/**
 * Staff Controller
 * Read-only access to branch data for STAFF role.
 * Branch Managers, Admins and Super Admins can also use these endpoints.
 */

const Customer           = require("../models/Customer");
const FinancialTransaction = require("../models/FinancialTransaction");
const Message            = require("../models/Message");
const User               = require("../models/User");
const Branch             = require("../models/Branch");

// ─── helpers ─────────────────────────────────────────────────────────────────

const paginate = (query = {}) => {
  const page  = Math.max(1, parseInt(query.page)  || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  return { page, limit, skip: (page - 1) * limit };
};

const ok = (res, data, message = "Success", statusCode = 200) =>
  res.status(statusCode).json({ success: true, message, data });

const fail = (res, message, code = "SERVER_ERROR", statusCode = 500) =>
  res.status(statusCode).json({ success: false, error: { message, code, timestamp: new Date().toISOString() } });

// ─── Dashboard ────────────────────────────────────────────────────────────────

exports.getStaffDashboard = async (req, res) => {
  try {
    const branchId = req.user.branch;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const branchFilter = branchId ? { branch: branchId } : {};

    const [customers, todayDeposits, todayLoans, pendingCount] = await Promise.all([
      Customer.countDocuments({ ...branchFilter, isActive: true }),
      FinancialTransaction.find({ ...branchFilter, type: "deposit", transactionDate: { $gte: today } }),
      FinancialTransaction.find({ ...branchFilter, type: "loan",    transactionDate: { $gte: today } }),
      FinancialTransaction.countDocuments({ ...branchFilter, status: "applied" }),
    ]);

    const totalDepositsToday   = todayDeposits.reduce((s, t) => s + t.amount, 0);
    const totalLoansToday      = todayLoans.reduce((s, t) => s + t.amount, 0);

    ok(res, {
      customers,
      todayDeposits: totalDepositsToday,
      todayLoans: totalLoansToday,
      pendingCount,
      reportDate: today.toISOString().split("T")[0],
    });
  } catch (e) {
    fail(res, e.message);
  }
};

// ─── Customers ────────────────────────────────────────────────────────────────

exports.listCustomers = async (req, res) => {
  try {
    const { page, limit, skip } = paginate(req.query);
    const { search } = req.query;
    const branchId = req.user.branch;

    const filter = { ...(branchId && { branch: branchId }), isActive: true };
    if (search) {
      filter.$or = [
        { name:  { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { area:  { $regex: search, $options: "i" } },
      ];
    }

    const [customers, total] = await Promise.all([
      Customer.find(filter).select("name phone area createdAt").skip(skip).limit(limit).sort({ createdAt: -1 }),
      Customer.countDocuments(filter),
    ]);

    ok(res, { customers, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (e) {
    fail(res, e.message);
  }
};

exports.getCustomerDetails = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id).populate("branch", "name area").populate("createdBy", "name");
    if (!customer) return fail(res, "Customer not found", "NOT_FOUND", 404);
    ok(res, { customer });
  } catch (e) {
    fail(res, e.message);
  }
};

// ─── Deposits ─────────────────────────────────────────────────────────────────

exports.viewDeposits = async (req, res) => {
  try {
    const { page, limit, skip } = paginate(req.query);
    const { status, startDate, endDate } = req.query;
    const branchId = req.user.branch;

    const filter = { ...(branchId && { branch: branchId }), type: "deposit" };
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.transactionDate = {};
      if (startDate) filter.transactionDate.$gte = new Date(startDate);
      if (endDate)   filter.transactionDate.$lte = new Date(endDate);
    }

    const [deposits, total] = await Promise.all([
      FinancialTransaction.find(filter).populate("customer", "name phone").skip(skip).limit(limit).sort({ transactionDate: -1 }),
      FinancialTransaction.countDocuments(filter),
    ]);

    ok(res, { deposits, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (e) {
    fail(res, e.message);
  }
};

exports.getDepositDetails = async (req, res) => {
  try {
    const deposit = await FinancialTransaction.findOne({ _id: req.params.id, type: "deposit" })
      .populate("customer", "name phone area")
      .populate("createdBy", "name")
      .populate("branch", "name");
    if (!deposit) return fail(res, "Deposit not found", "NOT_FOUND", 404);
    ok(res, { deposit });
  } catch (e) {
    fail(res, e.message);
  }
};

// ─── Loans ────────────────────────────────────────────────────────────────────

exports.viewLoans = async (req, res) => {
  try {
    const { page, limit, skip } = paginate(req.query);
    const { status, startDate, endDate } = req.query;
    const branchId = req.user.branch;

    const filter = { ...(branchId && { branch: branchId }), type: "loan" };
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.transactionDate = {};
      if (startDate) filter.transactionDate.$gte = new Date(startDate);
      if (endDate)   filter.transactionDate.$lte = new Date(endDate);
    }

    const [loans, total] = await Promise.all([
      FinancialTransaction.find(filter).populate("customer", "name phone").skip(skip).limit(limit).sort({ transactionDate: -1 }),
      FinancialTransaction.countDocuments(filter),
    ]);

    ok(res, { loans, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (e) {
    fail(res, e.message);
  }
};

exports.getLoanDetails = async (req, res) => {
  try {
    const loan = await FinancialTransaction.findOne({ _id: req.params.id, type: "loan" })
      .populate("customer", "name phone area")
      .populate("createdBy", "name")
      .populate("branch", "name");
    if (!loan) return fail(res, "Loan not found", "NOT_FOUND", 404);

    // Also fetch payments for this loan
    const payments = await FinancialTransaction.find({ type: "loan_payment", loan: loan._id })
      .select("amount transactionDate status createdBy")
      .populate("createdBy", "name")
      .sort({ transactionDate: 1 });

    ok(res, { loan, payments });
  } catch (e) {
    fail(res, e.message);
  }
};

// ─── Transactions ─────────────────────────────────────────────────────────────

exports.viewTransactions = async (req, res) => {
  try {
    const { page, limit, skip } = paginate(req.query);
    const { type, status, startDate, endDate } = req.query;
    const branchId = req.user.branch;

    const filter = { ...(branchId && { branch: branchId }) };
    if (type)   filter.type   = type;
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.transactionDate = {};
      if (startDate) filter.transactionDate.$gte = new Date(startDate);
      if (endDate)   filter.transactionDate.$lte = new Date(endDate);
    }

    const [transactions, total] = await Promise.all([
      FinancialTransaction.find(filter)
        .populate("customer", "name phone")
        .populate("branch", "name")
        .skip(skip).limit(limit).sort({ transactionDate: -1 }),
      FinancialTransaction.countDocuments(filter),
    ]);

    ok(res, { transactions, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (e) {
    fail(res, e.message);
  }
};

exports.getTransactionDetails = async (req, res) => {
  try {
    const transaction = await FinancialTransaction.findById(req.params.id)
      .populate("customer", "name phone area")
      .populate("branch", "name")
      .populate("createdBy", "name")
      .populate("loan", "amount status");
    if (!transaction) return fail(res, "Transaction not found", "NOT_FOUND", 404);
    ok(res, { transaction });
  } catch (e) {
    fail(res, e.message);
  }
};

// ─── Messages ─────────────────────────────────────────────────────────────────

exports.viewMessages = async (req, res) => {
  try {
    const { page, limit, skip } = paginate(req.query);
    const branchId = req.user.branch;

    const filter = { ...(branchId && { branch: branchId }) };

    const [messages, total] = await Promise.all([
      Message.find(filter)
        .populate("customer", "name phone")
        .populate("sentBy", "name role")
        .skip(skip).limit(limit).sort({ createdAt: -1 }),
      Message.countDocuments(filter),
    ]);

    ok(res, { messages, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (e) {
    fail(res, e.message);
  }
};

exports.getMessageDetails = async (req, res) => {
  try {
    const message = await Message.findById(req.params.id)
      .populate("customer", "name phone")
      .populate("sentBy", "name role")
      .populate("branch", "name");
    if (!message) return fail(res, "Message not found", "NOT_FOUND", 404);
    ok(res, { message });
  } catch (e) {
    fail(res, e.message);
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const { customerId, type, body } = req.body;

    if (!customerId || !type || !body) {
      return fail(res, "customerId, type and body are required", "VALIDATION_ERROR", 400);
    }

    const customer = await Customer.findById(customerId);
    if (!customer) return fail(res, "Customer not found", "NOT_FOUND", 404);

    const message = await Message.create({
      customer: customerId,
      branch:   customer.branch,
      sentBy:   req.user.userId,
      type,
      body,
    });

    ok(res, { message }, "Message sent", 201);
  } catch (e) {
    fail(res, e.message);
  }
};

exports.markMessageRead = async (req, res) => {
  try {
    // Message model doesn't have a read flag in schema — return ok for now
    ok(res, { id: req.params.id }, "Marked as read");
  } catch (e) {
    fail(res, e.message);
  }
};

// ─── Team ─────────────────────────────────────────────────────────────────────

exports.getTeamMembers = async (req, res) => {
  try {
    const branchId = req.user.branch;

    const filter = {
      isActive: true,
      role: { $in: ["staff", "branch_manager"] },
      _id: { $ne: req.user.userId },
      ...(branchId && { branch: branchId }),
    };

    const team = await User.find(filter)
      .select("name phone role lastLoginAt createdAt")
      .sort({ role: 1, name: 1 });

    ok(res, { team, total: team.length });
  } catch (e) {
    fail(res, e.message);
  }
};

// ─── Reports ──────────────────────────────────────────────────────────────────

exports.getDailyReport = async (req, res) => {
  try {
    const branchId = req.user.branch;
    const dateStr  = req.query.date || new Date().toISOString().split("T")[0];
    const dayStart = new Date(dateStr);
    const dayEnd   = new Date(dateStr);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const branchFilter = branchId ? { branch: branchId } : {};
    const dateFilter   = { transactionDate: { $gte: dayStart, $lt: dayEnd } };
    const q            = { ...branchFilter, ...dateFilter };

    const [deposits, loans, payments, withdrawals, newCustomers] = await Promise.all([
      FinancialTransaction.find({ ...q, type: "deposit" }),
      FinancialTransaction.find({ ...q, type: "loan" }),
      FinancialTransaction.find({ ...q, type: "loan_payment" }),
      FinancialTransaction.find({ ...q, type: "withdrawal" }),
      Customer.countDocuments({ ...branchFilter, createdAt: { $gte: dayStart, $lt: dayEnd } }),
    ]);

    const sum = (arr) => arr.reduce((s, t) => s + t.amount, 0);

    ok(res, {
      date: dateStr,
      summary: {
        deposits:    { count: deposits.length,    total: sum(deposits) },
        loans:       { count: loans.length,       total: sum(loans) },
        payments:    { count: payments.length,    total: sum(payments) },
        withdrawals: { count: withdrawals.length, total: sum(withdrawals) },
        newCustomers,
      },
    });
  } catch (e) {
    fail(res, e.message);
  }
};

exports.getMonthlyReport = async (req, res) => {
  try {
    const branchId = req.user.branch;
    const year  = parseInt(req.query.year)  || new Date().getFullYear();
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;

    const start = new Date(year, month - 1, 1);
    const end   = new Date(year, month, 0, 23, 59, 59, 999);

    const branchFilter = branchId ? { branch: branchId } : {};
    const dateFilter   = { transactionDate: { $gte: start, $lte: end } };
    const q            = { ...branchFilter, ...dateFilter };

    const [deposits, loans, payments, withdrawals, newCustomers] = await Promise.all([
      FinancialTransaction.find({ ...q, type: "deposit" }),
      FinancialTransaction.find({ ...q, type: "loan" }),
      FinancialTransaction.find({ ...q, type: "loan_payment" }),
      FinancialTransaction.find({ ...q, type: "withdrawal" }),
      Customer.countDocuments({ ...branchFilter, createdAt: { $gte: start, $lte: end } }),
    ]);

    const sum = (arr) => arr.reduce((s, t) => s + t.amount, 0);

    ok(res, {
      period: { year, month, startDate: start.toISOString().split("T")[0], endDate: end.toISOString().split("T")[0] },
      summary: {
        deposits:    { count: deposits.length,    total: sum(deposits) },
        loans:       { count: loans.length,       total: sum(loans) },
        payments:    { count: payments.length,    total: sum(payments) },
        withdrawals: { count: withdrawals.length, total: sum(withdrawals) },
        newCustomers,
      },
    });
  } catch (e) {
    fail(res, e.message);
  }
};

// ─── Profile ──────────────────────────────────────────────────────────────────

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select("-pin -__v")
      .populate("branch", "name area");
    if (!user) return fail(res, "User not found", "NOT_FOUND", 404);
    ok(res, { profile: user });
  } catch (e) {
    fail(res, e.message);
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const allowed = ["name", "address", "dateOfBirth"];
    const update  = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

    const user = await User.findByIdAndUpdate(req.user.userId, update, { new: true, runValidators: true })
      .select("-pin -__v")
      .populate("branch", "name area");

    ok(res, { profile: user }, "Profile updated");
  } catch (e) {
    fail(res, e.message);
  }
};
