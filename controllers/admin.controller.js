const mongoose = require("mongoose");
const Branch = require("../models/Branch");
const Customer = require("../models/Customer");
const Message = require("../models/Message");
const User = require("../models/User");
const Settings = require("../models/settings.Models");
const AuditLog = require("../models/AuditLog");
const { USER_ROLES } = require("../helpers/constants");
const { getTodayRange, getMonthRange } = require("../helpers/date");
const { getPagination, isValidPin, normalizePhone } = require("../helpers/validators");
const { applyLoanPayment } = require("../helpers/loanBalance");
const FinancialTransaction = require("../models/FinancialTransaction");
const { buildTransactionFilter, getTransactionDateField, normalizeFinancialTransaction } = require("../helpers/financialTransactions");
const { getResourceAuditLogs } = require("../helpers/audit");
const { getCache, setCache } = require("../helpers/cache");
const { buildUserListQuery } = require("../helpers/userManagement");

function requireAdmin(req, res) {
  if (![USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN].includes(req.user?.role)) {
    res.status(403).json({ message: "Only admin or superadmin can perform this action" });
    return false;
  }

  return true;
}

function requireAdminOrBranchManager(req, res) {
  if (![USER_ROLES.ADMIN, USER_ROLES.BRANCH_MANAGER, USER_ROLES.SUPER_ADMIN].includes(req.user?.role)) {
    res.status(403).json({ message: "Only admin, superadmin, or branch manager can perform this action" });
    return false;
  }

  return true;
}

function getTransactionDate(inputDate) {
  if (!inputDate) {
    return new Date();
  }

  const parsedDate = new Date(inputDate);
  return Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
}

async function createTransaction(req, res , next) {
  try {
    if (!requireAdminOrBranchManager(req, res)) return;

    const { type, amount, branchId, customerId, at, note, status } = req.body;
    if (!type || !amount || !branchId || !customerId) {
      return res.status(400).json({ message: "type, amount, branchId and customerId are required" });
    }

    if (!["deposit", "loan", "loan_payment", "withdrawal"].includes(type)) {
      return res.status(400).json({ message: "type must be deposit, loan, loan_payment or withdrawal" });
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ message: "amount must be a positive number" });
    }

    const branch = await Branch.findById(branchId);
    if (!branch) {
      return res.status(404).json({ message: "Branch not found" });
    }

    const customer = await Customer.findOne({ _id: customerId, branch: branchId, isActive: true });
    if (!customer) {
      return res.status(404).json({ message: "Customer not found in this branch" });
    }

    const transactionDate = getTransactionDate(at);

    if (type === "deposit") {
      const deposit = await FinancialTransaction.create({
        type: "deposit",
        customer: customerId,
        branch: branchId,
        amount: parsedAmount,
        note: note || "",
        createdBy: req.user.id,
        transactionDate,
        collectedAt: transactionDate,
      });

      return res.status(201).json({ message: "Deposit created", transaction: { id: deposit._id, _id: deposit._id, type: "deposit", amount: deposit.amount, branch: deposit.branch, customer: deposit.customer, at: deposit.collectedAt, note: deposit.note } });
    }

    if (type === "loan") {
      const nextStatus = status || "applied";
      if (!["applied", "passed", "absent", "rejected"].includes(nextStatus)) {
        return res.status(400).json({ message: "status must be applied, passed, absent or rejected" });
      }

      const loan = await FinancialTransaction.create({
        type: "loan",
        customer: customerId,
        branch: branchId,
        amount: parsedAmount,
        note: note || "",
        status: nextStatus,
        createdBy: req.user.id,
        approvedBy: ["passed", "absent", "rejected"].includes(nextStatus) ? req.user.id : null,
        transactionDate,
        appliedAt: transactionDate,
      });

      return res.status(201).json({ message: "Loan created", transaction: { id: loan._id, _id: loan._id, type: "loan", amount: loan.amount, branch: loan.branch, customer: loan.customer, at: loan.appliedAt, status: loan.status, note: loan.note } });
    }

    if (type === "loan_payment") {
      const { loanId } = req.body;
      if (!loanId) {
        return res.status(400).json({ message: "loanId is required for loan_payment" });
      }

      const loan = await FinancialTransaction.findOne({ _id: loanId, type: "loan" });
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }

      if (String(loan.customer) !== String(customerId)) {
        return res.status(400).json({ message: "Selected loan does not belong to the selected customer" });
      }

      if (String(loan.branch) !== String(branchId)) {
        return res.status(400).json({ message: "Selected loan does not belong to the selected branch" });
      }

      const paymentPlan = applyLoanPayment(loan, parsedAmount);
      if (paymentPlan.appliedAmount <= 0) {
        return res.status(400).json({ message: "Loan already has no outstanding balance" });
      }

      const payment = await FinancialTransaction.create({
        type: "loan_payment",
        loan: loanId,
        customer: customerId,
        branch: branchId,
        amount: paymentPlan.appliedAmount,
        note: note || "",
        createdBy: req.user.id,
        transactionDate,
        paidAt: transactionDate,
      });

      return res.status(201).json({
        message: paymentPlan.remainingAmount > 0 ? "Loan payment recorded and excess amount was capped to the remaining balance" : "Loan payment recorded",
        transaction: {
          id: payment._id,
          _id: payment._id,
          type: "loan_payment",
          amount: payment.amount,
          branch: payment.branch,
          customer: payment.customer,
          loan: payment.loan,
          at: payment.paidAt,
          note: payment.note,
          remainingAmount: paymentPlan.remainingAmount,
        },
      });
    }

    if (type === "withdrawal") {
      const withdrawal = await FinancialTransaction.create({
        type: "withdrawal",
        customer: customerId,
        branch: branchId,
        amount: parsedAmount,
        note: note || "",
        createdBy: req.user.id,
        transactionDate,
        withdrawnAt: transactionDate,
      });

      return res.status(201).json({ message: "Withdrawal recorded", transaction: { id: withdrawal._id, _id: withdrawal._id, type: "withdrawal", amount: withdrawal.amount, branch: withdrawal.branch, customer: withdrawal.customer, at: withdrawal.withdrawnAt, note: withdrawal.note } });
    }
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updateTransaction(req, res , next) {
  try {
    if (!requireAdminOrBranchManager(req, res)) return;

    const { transactionId } = req.params;
    const { type, amount, branchId, customerId, at, note, status, loanId } = req.body;

    const existing = await FinancialTransaction.findOne({ _id: transactionId });
    if (!existing) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    const existingType = existing.type;
    const transactionType = type || existingType;
    if (!["deposit", "loan", "loan_payment", "withdrawal"].includes(transactionType)) {
      return res.status(400).json({ message: "type must be deposit, loan, loan_payment or withdrawal" });
    }

    if (existingType !== transactionType) {
      return res.status(400).json({ message: `This transaction is a ${existingType} record. Use the ${existingType} type only` });
    }

    const update = {};
    if (amount !== undefined) {
      const parsedAmount = Number(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ message: "amount must be a positive number" });
      }
      update.amount = parsedAmount;
    }

    if (note !== undefined) {
      update.note = String(note).trim();
    }

    if (branchId !== undefined) {
      const branch = await Branch.findById(branchId);
      if (!branch) {
        return res.status(404).json({ message: "Branch not found" });
      }
      update.branch = branchId;
    }

    if (customerId !== undefined) {
      const resolvedBranchId = branchId || existing.branch;
      const customer = await Customer.findOne({ _id: customerId, branch: resolvedBranchId, isActive: true });
      if (!customer) {
        return res.status(404).json({ message: "Customer not found in this branch" });
      }
      update.customer = customerId;
    }

    if (at !== undefined) {
      const transactionDate = getTransactionDate(at);
      update.transactionDate = transactionDate;
      if (transactionType === "deposit") {
        update.collectedAt = transactionDate;
      } else if (transactionType === "loan") {
        update.appliedAt = transactionDate;
      } else if (transactionType === "loan_payment") {
        update.paidAt = transactionDate;
      } else if (transactionType === "withdrawal") {
        update.withdrawnAt = transactionDate;
      }
    }

    if (transactionType === "loan" && status !== undefined) {
      if (!["applied", "passed", "absent", "rejected"].includes(status)) {
        return res.status(400).json({ message: "status must be applied, passed, absent or rejected" });
      }
      update.status = status;
      if (["passed", "absent", "rejected"].includes(status)) {
        update.approvedBy = req.user.id;
      } else {
        update.approvedBy = null;
      }
    }

    if (transactionType === "loan_payment") {
      const resolvedCustomerId = customerId || existing.customer;
      const resolvedBranchId = branchId || existing.branch;
      if (loanId !== undefined) {
        const loan = await FinancialTransaction.findOne({ _id: loanId, type: "loan" });
        if (!loan) {
          return res.status(404).json({ message: "Loan not found" });
        }
        if (resolvedCustomerId && String(loan.customer) !== String(resolvedCustomerId)) {
          return res.status(400).json({ message: "Selected loan does not belong to the selected customer" });
        }
        if (resolvedBranchId && String(loan.branch) !== String(resolvedBranchId)) {
          return res.status(400).json({ message: "Selected loan does not belong to the selected branch" });
        }
        update.loan = loanId;
      }
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    const updatedTransaction = await FinancialTransaction.findOneAndUpdate(
      { _id: transactionId, type: existingType },
      update,
      { new: true }
    );

    if (!updatedTransaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    const transactionResponse = {
      id: updatedTransaction._id,
      _id: updatedTransaction._id,
      type: transactionType,
      amount: updatedTransaction.amount,
      branch: updatedTransaction.branch,
      customer: updatedTransaction.customer,
      note: updatedTransaction.note,
    };

    if (transactionType === "deposit") {
      transactionResponse.at = updatedTransaction.collectedAt;
    } else if (transactionType === "loan") {
      transactionResponse.at = updatedTransaction.appliedAt;
      transactionResponse.status = updatedTransaction.status;
    } else if (transactionType === "loan_payment") {
      transactionResponse.at = updatedTransaction.paidAt;
      transactionResponse.loan = updatedTransaction.loan;
    } else if (transactionType === "withdrawal") {
      transactionResponse.at = updatedTransaction.withdrawnAt;
    }

    return res.json({ message: "Transaction updated", transaction: transactionResponse });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function deleteTransaction(req, res, next) {
  try {
    if (!requireAdminOrBranchManager(req, res)) return;

    const { transactionId } = req.params;
    const transaction = await FinancialTransaction.findById(transactionId);
    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    await FinancialTransaction.findByIdAndDelete(transactionId);
    return res.json({ message: "Transaction deleted", type: transaction.type });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getMeta(req, res, next) {
  try {
    let settings = await Settings.findOne().lean();

    if (!settings) {
      settings = await Settings.create({});
    }

    return res.json({
      organization: settings.siteTitle,
      siteTitle: settings.siteTitle,
      siteLogo: settings.siteLogo,
      siteDescription: settings.siteDescription,
      supportContact: settings.supportContact,
      officeAddress: settings.officeAddress,
      officeHours: settings.officeHours,
      socialLinks: settings.socialLinks,
      permissions: settings.permissions,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getSettings(req, res, next) {
  try {
    let settings = await Settings.findOne().lean();
    if (!settings) {
      settings = await Settings.create({});
      settings = settings.toObject();
    }

    return res.json({ settings });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updateSettings(req, res, next) {
  try {
    const updates = req.body || {};
    const allowed = [
      "siteLogo",
      "siteTitle",
      "siteDescription",
      "supportContact",
      "officeAddress",
      "officeHours",
      "socialLinks",
      "permissions",
    ];

    const patch = allowed.reduce((acc, key) => {
      if (typeof updates[key] !== "undefined") {
        acc[key] = updates[key];
      }
      return acc;
    }, {});

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ message: "No valid settings fields provided" });
    }

    const settings = await Settings.findOneAndUpdate({}, patch, {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }).lean();

    return res.json({ message: "Settings updated", settings });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function createBranch(req, res, next) {
  try {
    if (!requireAdmin(req, res)) return;

    const { name, area } = req.body;
    if (!name || !area) {
      return res.status(400).json({ message: "name and area are required" });
    }

    const normalizedName = String(name).trim();
    const normalizedArea = String(area).trim().toLowerCase();

    const existingBranch = await Branch.findOne({
      name: new RegExp(`^${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
      area: normalizedArea,
    });

    if (existingBranch) {
      return res.status(409).json({ message: "Branch already exists in this area" });
    }

    const branch = await Branch.create({ name: normalizedName, area: normalizedArea });
    return res.status(201).json({ message: "Branch created", branch });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updateBranch(req, res, next) {
  try {
    if (!requireAdmin(req, res)) return;

    const { branchId } = req.params;
    const { name, area, isActive } = req.body;
    const update = {};

    if (name !== undefined) {
      const nextName = String(name).trim();
      if (!nextName) {
        return res.status(400).json({ message: "name cannot be empty" });
      }
      update.name = nextName;
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

    const branch = await Branch.findByIdAndUpdate(branchId, update, { new: true });
    if (!branch) {
      return res.status(404).json({ message: "Branch not found" });
    }

    return res.json({ message: "Branch updated", branch });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function deleteBranch(req, res, next) {
  try {
    if (!requireAdmin(req, res)) return;

    const { branchId } = req.params;
    const branch = await Branch.findById(branchId);
    if (!branch) {
      return res.status(404).json({ message: "Branch not found" });
    }

    const [usersCount, customersCount, financialTransactionsCount, loansCount] = await Promise.all([
      User.countDocuments({ branch: branch._id }),
      Customer.countDocuments({ branch: branch._id }),
      FinancialTransaction.countDocuments({ branch: branch._id }),
      FinancialTransaction.countDocuments({ branch: branch._id, type: "loan" }),
    ]);

    const hasLinkedData = usersCount > 0 || customersCount > 0 || financialTransactionsCount > 0 || loansCount > 0;

    if (hasLinkedData) {
      branch.isActive = false;
      await branch.save();
      return res.json({
        message: "Branch has linked records, so it was deactivated instead of deleted",
        mode: "deactivated",
        branch,
      });
    }

    await Branch.deleteOne({ _id: branch._id });
    return res.json({ message: "Branch deleted", mode: "deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function listBranches(req, res, next) {
  try {
    const { page, limit, skip } = getPagination(req.query, 20, 100);
    const [branches, total] = await Promise.all([
      Branch.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      Branch.countDocuments(),
    ]);
    return res.json({ branches, pagination: { page, limit, total } });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function listUsers(req, res, next) {
  try {
    const { page, limit, skip } = getPagination(req.query, 20, 500);
    const query = buildUserListQuery(req.query);

    const [users, total] = await Promise.all([
      User.find(query).populate("branch").select("-pin").sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(query),
    ]);
    return res.json({ users, pagination: { page, limit, total } });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function listBranchCustomers(req, res, next) {
  try {
    if (!requireAdminOrBranchManager(req, res)) return;

    const { branchId } = req.query;
    if (!branchId) {
      return res.status(400).json({ message: "branchId query parameter is required" });
    }

    const { page, limit, skip } = getPagination(req.query, 20, 200);
    const query = { branch: branchId, isActive: true };
    const search = String(req.query.q || req.query.search || "").trim();

    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");
      const digitsOnly = String(search).replace(/\D+/g, "");

      query.$or = [
        { name: regex },
        { phone: regex },
        { area: regex },
      ];

      if (digitsOnly) {
        query.$or.push({ phone: new RegExp(digitsOnly, "i") });
      }

      if (mongoose.Types.ObjectId.isValid(search)) {
        query.$or.push({ _id: new mongoose.Types.ObjectId(search) });
      }
    }

    const [customers, total] = await Promise.all([
      Customer.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Customer.countDocuments(query),
    ]);
    return res.json({ customers, pagination: { page, limit, total } });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getUserSummary(req, res, next) {
  try {
    if (!requireAdminOrBranchManager(req, res)) return;

    const { userId } = req.params;
    const user = await User.findById(userId).populate("branch").select("-pin");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const customer = await Customer.findOne({
      phone: user.phone,
      branch: user.branch?._id,
      isActive: true,
    });

    const customerId = customer?._id || null;
    const baseMatch = customerId ? { customer: customerId } : { _id: null };

    const [depositAgg, loanAgg, loanPaymentAgg, withdrawalAgg, deposits, loans, loanPayments, withdrawals] = await Promise.all([
      FinancialTransaction.aggregate([
        { $match: { ...baseMatch, type: "deposit" } },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 }, lastAt: { $max: "$collectedAt" } } },
      ]),
      FinancialTransaction.aggregate([
        { $match: { ...baseMatch, type: "loan" } },
        {
          $group: {
            _id: null,
            totalApplied: { $sum: "$amount" },
            totalApproved: { $sum: { $cond: [{ $eq: ["$status", "passed"] }, "$amount", 0] } },
            totalLoanCount: { $sum: 1 },
            lastAt: { $max: "$appliedAt" },
          },
        },
      ]),
      FinancialTransaction.aggregate([
        { $match: { ...baseMatch, type: "loan_payment" } },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 }, lastAt: { $max: "$paidAt" } } },
      ]),
      FinancialTransaction.aggregate([
        { $match: { ...baseMatch, type: "withdrawal" } },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 }, lastAt: { $max: "$withdrawnAt" } } },
      ]),
      FinancialTransaction.find(customerId ? { customer: customerId, type: "deposit" } : { _id: null }).sort({ collectedAt: -1 }).limit(5).lean(),
      FinancialTransaction.find(customerId ? { customer: customerId, type: "loan" } : { _id: null }).sort({ appliedAt: -1 }).limit(5).lean(),
      FinancialTransaction.find(customerId ? { customer: customerId, type: "loan_payment" } : { _id: null }).sort({ paidAt: -1 }).limit(5).lean(),
      FinancialTransaction.find(customerId ? { customer: customerId, type: "withdrawal" } : { _id: null }).sort({ withdrawnAt: -1 }).limit(5).lean(),
    ]);

    const depositSummary = depositAgg[0] || { total: 0, count: 0, lastAt: null };
    const loanSummary = loanAgg[0] || { totalApplied: 0, totalApproved: 0, totalLoanCount: 0, lastAt: null };
    const loanPaymentSummary = loanPaymentAgg[0] || { total: 0, count: 0, lastAt: null };
    const withdrawalSummary = withdrawalAgg[0] || { total: 0, count: 0, lastAt: null };

    return res.json({
      user,
      customer: customer || null,
      summary: {
        totalDeposit: depositSummary.total,
        depositCount: depositSummary.count,
        lastDepositAt: depositSummary.lastAt,
        totalLoanApplied: loanSummary.totalApplied,
        totalLoanApproved: loanSummary.totalApproved,
        loanCount: loanSummary.totalLoanCount,
        lastLoanAt: loanSummary.lastAt,
        totalLoanPaid: loanPaymentSummary.total,
        loanPaymentCount: loanPaymentSummary.count,
        lastLoanPaymentAt: loanPaymentSummary.lastAt,
        totalWithdrawn: withdrawalSummary.total,
        withdrawalCount: withdrawalSummary.count,
        lastWithdrawalAt: withdrawalSummary.lastAt,
        totalOutstandingLoan: Math.max(0, loanSummary.totalApproved - loanPaymentSummary.total),
      },
      recent: {
        deposits,
        loans,
        loanPayments,
        withdrawals,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getUserDetails(req, res, next) {
  try {
    if (!requireAdminOrBranchManager(req, res)) return;

    const { userId } = req.params;
    const user = await User.findById(userId).populate("branch").select("-pin");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const customer = await Customer.findOne({
      phone: user.phone,
      branch: user.branch?._id,
      isActive: true,
    });

    return res.json({ user, customer: customer || null });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function createUserWithdrawal(req, res, next) {
  try {
    if (!requireAdminOrBranchManager(req, res)) return;

    const { userId } = req.params;
    const { amount, note } = req.body;
    if (!amount) {
      return res.status(400).json({ message: "amount is required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const customer = await Customer.findOne({
      phone: user.phone,
      branch: user.branch,
      isActive: true,
    });
    if (!customer) {
      return res.status(404).json({ message: "Customer record not found for this user" });
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ message: "amount must be a positive number" });
    }

    const withdrawal = await FinancialTransaction.create({
      type: "withdrawal",
      customer: customer._id,
      branch: customer.branch,
      amount: parsedAmount,
      note: String(note || "").trim(),
      createdBy: req.user.id,
      transactionDate: getTransactionDate(req.body.withdrawnAt),
      withdrawnAt: getTransactionDate(req.body.withdrawnAt),
    });

    return res.status(201).json({ message: "Withdrawal recorded", withdrawal });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function createUserLoanPayment(req, res, next) {
  try {
    if (!requireAdminOrBranchManager(req, res)) return;

    const { userId } = req.params;
    const { loanId, amount, note } = req.body;
    if (!loanId || !amount) {
      return res.status(400).json({ message: "loanId and amount are required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const customer = await Customer.findOne({
      phone: user.phone,
      branch: user.branch,
      isActive: true,
    });
    if (!customer) {
      return res.status(404).json({ message: "Customer record not found for this user" });
    }

    const loan = await FinancialTransaction.findOne({ _id: loanId, type: "loan", customer: customer._id, branch: customer.branch });
    if (!loan) {
      return res.status(404).json({ message: "Loan not found for this customer" });
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ message: "amount must be a positive number" });
    }

    const payment = await FinancialTransaction.create({
      type: "loan_payment",
      loan: loan._id,
      customer: customer._id,
      branch: customer.branch,
      amount: parsedAmount,
      note: String(note || "").trim(),
      createdBy: req.user.id,
      transactionDate: getTransactionDate(req.body.paidAt),
      paidAt: getTransactionDate(req.body.paidAt),
    });

    const updatedLoan = await FinancialTransaction.findById(loan._id).lean();

    return res.status(201).json({ message: "Loan payment recorded", payment, loan: updatedLoan });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

function buildUserPayload(body, existingUser = null) {
  const payload = {};

  if (body.name !== undefined) payload.name = String(body.name).trim();
  if (body.phone !== undefined) payload.phone = normalizePhone(body.phone);
  if (body.pin !== undefined) payload.pin = String(body.pin).trim();
  if (body.role !== undefined) payload.role = body.role;
  if (body.branchId !== undefined) payload.branch = body.branchId || null;
  if (body.area !== undefined) payload.area = String(body.area).trim().toLowerCase();
  if (body.isActive !== undefined) payload.isActive = body.isActive === true || body.isActive === "true";
  if (body.nidNumber !== undefined) payload.nidNumber = String(body.nidNumber).trim();
  if (body.dateOfBirth !== undefined) payload.dateOfBirth = String(body.dateOfBirth).trim();
  if (body.address !== undefined) payload.address = String(body.address).trim();
  if (body.fatherName !== undefined) payload.fatherName = String(body.fatherName).trim();
  if (body.kycStatus !== undefined) payload.kycStatus = body.kycStatus;
  if (body.kycNote !== undefined) payload.kycNote = String(body.kycNote).trim();

  if (body.kycStatus !== undefined) {
    if (body.kycStatus === "verified") {
      payload.kycVerifiedAt = new Date();
    } else {
      payload.kycVerifiedAt = null;
    }
  }

  if (existingUser && body.pin === undefined) {
    delete payload.pin;
  }

  return payload;
}

async function createUser(req, res, next) {
  try {
    if (!requireAdminOrBranchManager(req, res)) return;

    const { name, phone, pin, role } = req.body;
    if (!name || !phone || !pin || !role) {
      return res.status(400).json({ message: "name, phone, pin and role are required" });
    }

    if (!Object.values(USER_ROLES).includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    if (!isValidPin(pin)) {
      return res.status(400).json({ message: "PIN must be 4 digits" });
    }

    const normalizedPhone = normalizePhone(phone);
    const existing = await User.findOne({ phone: normalizedPhone });
    if (existing) {
      return res.status(409).json({ message: "Phone already exists" });
    }

    const payload = buildUserPayload(req.body);
    payload.phone = normalizedPhone;
    payload.pin = pin;

    if (payload.branch) {
      const branch = await Branch.findById(payload.branch);
      if (!branch || !branch.isActive) {
        return res.status(400).json({ message: "Active branch is required" });
      }
      if (!payload.area) {
        payload.area = String(branch.area || "").trim().toLowerCase();
      }
    }

    const user = await User.create(payload);
    const savedUser = await User.findById(user._id).populate("branch").select("-pin");
    return res.status(201).json({ message: "User created", user: savedUser });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updateUser(req, res, next) {
  try {
    if (!requireAdminOrBranchManager(req, res)) return;

    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role === USER_ROLES.SUPER_ADMIN && req.user?.role !== USER_ROLES.SUPER_ADMIN) {
      return res.status(403).json({ message: "Only superadmin can edit superadmin" });
    }

    if (user.role === USER_ROLES.ADMIN && ![USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN].includes(req.user?.role)) {
      return res.status(403).json({ message: "Only admin or superadmin can edit admin" });
    }

    const payload = buildUserPayload(req.body, user);

    if (payload.phone) {
      const existing = await User.findOne({ phone: payload.phone, _id: { $ne: userId } });
      if (existing) {
        return res.status(409).json({ message: "Phone already exists" });
      }
    }

    if (payload.role && !Object.values(USER_ROLES).includes(payload.role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    if (payload.branch) {
      const branch = await Branch.findById(payload.branch);
      if (!branch || !branch.isActive) {
        return res.status(400).json({ message: "Active branch is required" });
      }
      if (!payload.area) {
        payload.area = String(branch.area || "").trim().toLowerCase();
      }
    }

    if (payload.pin && !isValidPin(payload.pin)) {
      return res.status(400).json({ message: "PIN must be 4 digits" });
    }

    Object.assign(user, payload);
    await user.save();

    const updatedUser = await User.findById(user._id).populate("branch").select("-pin");
    return res.json({ message: "User updated", user: updatedUser });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function deleteUser(req, res, next) {
  try {
    if (!requireAdminOrBranchManager(req, res)) return;

    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role === USER_ROLES.SUPER_ADMIN && req.user?.role !== USER_ROLES.SUPER_ADMIN) {
      return res.status(403).json({ message: "Only superadmin can delete superadmin" });
    }

    if (user.role === USER_ROLES.ADMIN && ![USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN].includes(req.user?.role)) {
      return res.status(403).json({ message: "Only admin or superadmin can delete admin" });
    }

    user.isActive = false;
    await user.save();
    return res.json({ message: "User deactivated" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updateUserKyc(req, res, next) {
  try {
    if (!requireAdminOrBranchManager(req, res)) return;

    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const { nidNumber, dateOfBirth, address, fatherName, kycStatus, kycNote } = req.body;

    if (nidNumber !== undefined) user.nidNumber = String(nidNumber).trim();
    if (dateOfBirth !== undefined) user.dateOfBirth = String(dateOfBirth).trim();
    if (address !== undefined) user.address = String(address).trim();
    if (fatherName !== undefined) user.fatherName = String(fatherName).trim();
    if (kycNote !== undefined) user.kycNote = String(kycNote).trim();

    if (kycStatus !== undefined) {
      if (!["pending", "verified", "rejected"].includes(kycStatus)) {
        return res.status(400).json({ message: "Invalid kycStatus" });
      }

      user.kycStatus = kycStatus;
      user.kycVerifiedAt = kycStatus === "verified" ? new Date() : null;
      user.kycUpdatedBy = req.user.id;
    }

    await user.save();
    const updatedUser = await User.findById(user._id).populate("branch kycUpdatedBy", "name area role").select("-pin");
    return res.json({ message: "KYC updated", user: updatedUser });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function listBranchAdmins(req, res, next) {
  try {
    const { page, limit, skip } = getPagination(req.query, 20, 100);
    const includeInactive = req.query.includeInactive === "true";
    // Show only ADMIN and BRANCH_MANAGER roles
    const query = {
      role: { $in: [USER_ROLES.ADMIN, USER_ROLES.BRANCH_MANAGER] },
      branch: { $ne: null },
    };

    if (!includeInactive) {
      query.isActive = true;
    }

    if (req.query.branchId) {
      query.branch = req.query.branchId;
    }

    if (req.query.search) {
      const search = String(req.query.search).trim();
      if (search) {
        query.$or = [
          { name: new RegExp(search, "i") },
          { phone: new RegExp(search, "i") },
          { area: new RegExp(search, "i") },
        ];
      }
    }

    const [branchAdmins, total] = await Promise.all([
      User.find(query).populate("branch").select("-pin").sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(query),
    ]);

    return res.json({ branchAdmins, pagination: { page, limit, total } });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function createBranchAdmin(req, res, next) {
  try {
    if (!requireAdmin(req, res)) return;

    const { name, pin, area, branchId } = req.body;
    const role = req.body.role || USER_ROLES.BRANCH_MANAGER;
    const phone = normalizePhone(req.body.phone);

    if (!name || !phone || !pin || !branchId) {
      return res.status(400).json({ message: "name, phone, pin, branchId are required" });
    }

    if (![USER_ROLES.ADMIN, USER_ROLES.BRANCH_MANAGER].includes(role)) {
      return res.status(400).json({ message: "role must be admin or branch_manager" });
    }

    if (!isValidPin(pin)) {
      return res.status(400).json({ message: "PIN must be 4 digits" });
    }

    const [branch, existing] = await Promise.all([
      Branch.findById(branchId),
      User.findOne({ phone }),
    ]);

    if (!branch || !branch.isActive) {
      return res.status(400).json({ message: "Active branch is required" });
    }

    if (existing) {
      return res.status(409).json({ message: "Phone already exists" });
    }

    const user = await User.create({
      name: String(name).trim(),
      phone,
      pin,
      role,
      branch: branchId,
      area: String(area || branch.area || "").trim().toLowerCase(),
      isActive: true,
    });

    const savedUser = await User.findById(user._id).populate("branch").select("-pin");
    return res.status(201).json({ message: "Branch admin created", user: savedUser });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updateBranchAdmin(req, res, next) {
  try {
    if (!requireAdmin(req, res)) return;

    const { userId } = req.params;
    const { name, area, role, branchId, isActive, pin } = req.body;
    const nextPhone = req.body.phone ? normalizePhone(req.body.phone) : undefined;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Branch admin not found" });
    }

    if ([USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN].includes(user.role)) {
      return res.status(400).json({ message: "Admin or superadmin cannot be edited here" });
    }

    if (role !== undefined && ![USER_ROLES.ADMIN, USER_ROLES.BRANCH_MANAGER].includes(role)) {
      return res.status(400).json({ message: "role must be admin or branch_manager" });
    }

    if (pin !== undefined && !isValidPin(pin)) {
      return res.status(400).json({ message: "PIN must be 4 digits" });
    }

    if (nextPhone) {
      const existing = await User.findOne({ phone: nextPhone, _id: { $ne: userId } });
      if (existing) {
        return res.status(409).json({ message: "Phone already exists" });
      }
      user.phone = nextPhone;
    }

    if (branchId !== undefined) {
      const branch = await Branch.findById(branchId);
      if (!branch || !branch.isActive) {
        return res.status(400).json({ message: "Active branch is required" });
      }
      user.branch = branchId;
      if (!area) {
        user.area = String(branch.area || "").trim().toLowerCase();
      }
    }

    if (name !== undefined) {
      user.name = String(name).trim();
    }

    if (area !== undefined) {
      user.area = String(area).trim().toLowerCase();
    }

    if (role !== undefined) {
      user.role = role;
    }

    if (isActive !== undefined) {
      user.isActive = Boolean(isActive);
    }

    if (pin !== undefined) {
      user.pin = String(pin);
    }

    await user.save();
    const updatedUser = await User.findById(user._id).populate("branch").select("-pin");

    return res.json({ message: "Branch admin updated", user: updatedUser });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function deleteBranchAdmin(req, res, next) {
  try {
    if (!requireAdmin(req, res)) return;

    const { userId } = req.params;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "Branch admin not found" });
    }

    if ([USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN].includes(user.role)) {
      return res.status(400).json({ message: "Admin or superadmin cannot be deleted" });
    }

    user.isActive = false;
    await user.save();

    return res.json({ message: "Branch admin deactivated" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getDashboardSummary(req, res, next) {
  try {
    const cacheKey = "dashboard_summary_v1";
    const cached = getCache(cacheKey);
    if (cached) return res.json({ summary: cached });

    const today = getTodayRange();
    const month = getMonthRange();
    const depositDateField = getTransactionDateField("deposit");
    const loanDateField = getTransactionDateField("loan");
    const loanPaymentDateField = getTransactionDateField("loan_payment");
    const withdrawalDateField = getTransactionDateField("withdrawal");

    const buildAmountSummary = (type, startDate, endDate) => FinancialTransaction.aggregate([
      { $match: { type, [getTransactionDateField(type)]: { $gte: startDate, $lt: endDate } } },
      { $group: { _id: null, totalAmount: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]);

    const todayDepositsAgg = buildAmountSummary("deposit", today.start, today.end);
    const monthDepositsAgg = buildAmountSummary("deposit", month.start, month.end);
    const todayWithdrawalsAgg = buildAmountSummary("withdrawal", today.start, today.end);
    const monthWithdrawalsAgg = buildAmountSummary("withdrawal", month.start, month.end);
    const todayLoanApplyAgg = buildAmountSummary("loan", today.start, today.end);
    const monthLoanApplyAgg = buildAmountSummary("loan", month.start, month.end);
    const todayLoanPassAgg = FinancialTransaction.aggregate([
      { $match: { type: "loan", status: "passed", [loanDateField]: { $gte: today.start, $lt: today.end } } },
      { $group: { _id: null, totalAmount: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]);
    const monthLoanPassAgg = FinancialTransaction.aggregate([
      { $match: { type: "loan", status: "passed", [loanDateField]: { $gte: month.start, $lt: month.end } } },
      { $group: { _id: null, totalAmount: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]);
    const todayLoanPaymentsAgg = buildAmountSummary("loan_payment", today.start, today.end);
    const monthLoanPaymentsAgg = buildAmountSummary("loan_payment", month.start, month.end);

    const [
      todayDepositsRes,
      monthDepositsRes,
      todayWithdrawalsRes,
      monthWithdrawalsRes,
      todayLoanApplyRes,
      monthLoanApplyRes,
      todayLoanPassRes,
      monthLoanPassRes,
      todayLoanPaymentsRes,
      monthLoanPaymentsRes,
      usersCount,
      verifiedKycCount,
      pendingKycCount,
      rejectedKycCount,
    ] = await Promise.all([
      todayDepositsAgg,
      monthDepositsAgg,
      todayWithdrawalsAgg,
      monthWithdrawalsAgg,
      todayLoanApplyAgg,
      monthLoanApplyAgg,
      todayLoanPassAgg,
      monthLoanPassAgg,
      todayLoanPaymentsAgg,
      monthLoanPaymentsAgg,
      User.countDocuments(),
      User.countDocuments({ kycStatus: "verified" }),
      User.countDocuments({ kycStatus: "pending" }),
      User.countDocuments({ kycStatus: "rejected" }),
    ]);

    // Add system-wide counts and simple trends for last 7 days
    const [branchesCount, customersCount, transactionsCount, depositsCount, loansCount, withdrawalsCount, loanPaymentsCount, auditLogsCount] = await Promise.all([
      Branch.countDocuments(),
      Customer.countDocuments(),
      FinancialTransaction.countDocuments(),
      FinancialTransaction.countDocuments({ type: "deposit" }),
      FinancialTransaction.countDocuments({ type: "loan" }),
      FinancialTransaction.countDocuments({ type: "withdrawal" }),
      FinancialTransaction.countDocuments({ type: "loan_payment" }),
      AuditLog.countDocuments(),
    ]);

    // 7-day trends (amount per day) for deposits and withdrawals
    const days = 7;
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - (days - 1));

    const formatDayGroup = {
      $dateToString: { format: "%Y-%m-%d", date: "$transactionDate" },
    };

    const depositsTrendAgg = FinancialTransaction.aggregate([
      { $match: { type: "deposit", transactionDate: { $gte: new Date(sinceDate.setHours(0,0,0,0)) } } },
      { $group: { _id: formatDayGroup, totalAmount: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    const withdrawalsTrendAgg = FinancialTransaction.aggregate([
      { $match: { type: "withdrawal", transactionDate: { $gte: new Date(sinceDate.setHours(0,0,0,0)) } } },
      { $group: { _id: formatDayGroup, totalAmount: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    const recentErrorsAgg = AuditLog.countDocuments({ statusCode: { $gte: 500 }, createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } });

    const [depositsTrendRes, withdrawalsTrendRes, recentErrorsCount] = await Promise.all([
      depositsTrendAgg,
      withdrawalsTrendAgg,
      recentErrorsAgg,
    ]);

    const summary = {
      deposits: {
        today: { total: todayDepositsRes[0]?.totalAmount || 0, count: todayDepositsRes[0]?.count || 0 },
        month: { total: monthDepositsRes[0]?.totalAmount || 0, count: monthDepositsRes[0]?.count || 0 },
      },
      withdrawals: {
        today: { total: todayWithdrawalsRes[0]?.totalAmount || 0, count: todayWithdrawalsRes[0]?.count || 0 },
        month: { total: monthWithdrawalsRes[0]?.totalAmount || 0, count: monthWithdrawalsRes[0]?.count || 0 },
      },
      loans: {
        applied: {
          today: { total: todayLoanApplyRes[0]?.totalAmount || 0, count: todayLoanApplyRes[0]?.count || 0 },
          month: { total: monthLoanApplyRes[0]?.totalAmount || 0, count: monthLoanApplyRes[0]?.count || 0 },
        },
        passed: {
          today: { total: todayLoanPassRes[0]?.totalAmount || 0, count: todayLoanPassRes[0]?.count || 0 },
          month: { total: monthLoanPassRes[0]?.totalAmount || 0, count: monthLoanPassRes[0]?.count || 0 },
        },
      },
      loanPayments: {
        today: { total: todayLoanPaymentsRes[0]?.totalAmount || 0, count: todayLoanPaymentsRes[0]?.count || 0 },
        month: { total: monthLoanPaymentsRes[0]?.totalAmount || 0, count: monthLoanPaymentsRes[0]?.count || 0 },
      },
      system: {
        branchesCount,
        customersCount,
        transactionsCount,
        depositsCount,
        loansCount,
        withdrawalsCount,
        loanPaymentsCount,
        auditLogsCount,
        recentErrorsCount,
      },
      trends: {
        deposits: depositsTrendRes.map((r) => ({ day: r._id, total: r.totalAmount || 0, count: r.count || 0 })),
        withdrawals: withdrawalsTrendRes.map((r) => ({ day: r._id, total: r.totalAmount || 0, count: r.count || 0 })),
      },
      usersCount,
      verifiedKycCount,
      pendingKycCount,
      rejectedKycCount,
    };

    // cache for 60 seconds
    try {
      setCache(cacheKey, summary, 60);
    } catch (e) {
      // ignore cache errors
    }

    return res.json({ summary });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getTransactions(req, res, next) {
  try {
    const { q, type, status, branchId, fromDate, toDate, customerId, loanId } = req.query;
    const { page, limit, skip } = getPagination(req.query, 20, 100);
    const queryText = String(q || "").trim();

    const parseDate = (d) => {
      if (!d) return null;
      const parsed = new Date(d);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const from = parseDate(fromDate);
    const to = parseDate(toDate);
    const transactionType = ["deposit", "loan", "loan_payment", "withdrawal"].includes(type) ? type : undefined;

    const match = buildTransactionFilter({
      type: transactionType,
      branchId,
      customerId,
      loanId,
      status,
      from,
      to,
      queryText,
    });

    const [transactions, total] = await Promise.all([
      FinancialTransaction.find(match)
        .populate("customer", "name phone")
        .populate("branch", "name")
        .populate("createdBy", "name phone role")
        .populate("approvedBy", "name phone role")
        .sort({ transactionDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      FinancialTransaction.countDocuments(match),
    ]);

    const pageItems = transactions.map(normalizeFinancialTransaction);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return res.json({
      transactions: pageItems,
      pagination: { page, limit, total, totalPages },
      totalPages,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getTransactionById(req, res, next  ) {
  try {
    const { transactionId } = req.params;
    if (!transactionId) return res.status(400).json({ message: "transactionId is required" });

    const transaction = await FinancialTransaction.findOne({ _id: transactionId })
      .populate("customer", "name phone")
      .populate("branch", "name")
      .populate("createdBy", "name phone role")
      .populate("approvedBy", "name phone role")
      .lean();

    if (!transaction) return res.status(404).json({ message: "Transaction not found" });

    const normalized = normalizeFinancialTransaction(transaction);
    return res.json({ transaction: normalized });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getTransactionTotals(req, res, next) {
  try {
    const { type, status, branchId, fromDate, toDate, customerId, loanId, q } = req.query;
    const parseDate = (d) => {
      if (!d) return null;
      const parsed = new Date(d);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const from = parseDate(fromDate);
    const to = parseDate(toDate);
    const transactionType = ["deposit", "loan", "loan_payment", "withdrawal"].includes(type) ? type : undefined;
    const queryText = String(q || "").trim();

    const [depositAgg, loanAgg, withdrawalAgg, loanPaymentAgg] = await Promise.all([
      FinancialTransaction.aggregate([
        { $match: buildTransactionFilter({ type: transactionType === "deposit" ? "deposit" : undefined, branchId, customerId, loanId, status, from, to, queryText }) },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      FinancialTransaction.aggregate([
        { $match: buildTransactionFilter({ type: transactionType === "loan" ? "loan" : undefined, branchId, customerId, loanId, status, from, to, queryText }) },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      FinancialTransaction.aggregate([
        { $match: buildTransactionFilter({ type: transactionType === "withdrawal" ? "withdrawal" : undefined, branchId, customerId, loanId, status, from, to, queryText }) },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      FinancialTransaction.aggregate([
        { $match: buildTransactionFilter({ type: transactionType === "loan_payment" ? "loan_payment" : undefined, branchId, customerId, loanId, status, from, to, queryText }) },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
    ]);

    const totals = {
      deposits: { total: depositAgg[0]?.total || 0, count: depositAgg[0]?.count || 0 },
      loans: { total: loanAgg[0]?.total || 0, count: loanAgg[0]?.count || 0 },
      withdrawals: { total: withdrawalAgg[0]?.total || 0, count: withdrawalAgg[0]?.count || 0 },
      loanPayments: { total: loanPaymentAgg[0]?.total || 0, count: loanPaymentAgg[0]?.count || 0 },
    };

    return res.json({ totals });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getBranchPerformance(req, res, next) {
  try {
    const branches = await Branch.find().sort({ name: 1 });

    const branchPerformance = await Promise.all(
      branches.map(async (branch) => {
        const [customerCount, depositAgg, passedLoanAgg] = await Promise.all([
          Customer.countDocuments({ branch: branch._id, isActive: true }),
          FinancialTransaction.aggregate([
            { $match: { type: "deposit", branch: branch._id } },
            { $group: { _id: null, total: { $sum: "$amount" } } },
          ]),
          FinancialTransaction.aggregate([
            { $match: { type: "loan", branch: branch._id, status: "passed" } },
            { $group: { _id: null, total: { $sum: "$amount" } } },
          ]),
        ]);

        const totalDeposit = depositAgg[0]?.total || 0;
        const totalLoanPassed = passedLoanAgg[0]?.total || 0;

        return {
          branchId: branch._id,
          branchName: branch.name,
          area: branch.area,
          customerCount,
          totalDeposit,
          totalLoanPassed,
          netAvailable: totalDeposit - totalLoanPassed,
        };
      })
    );

    return res.json({ branchPerformance });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function listLoans(req, res, next) {
  try {
    if (!requireAdminOrBranchManager(req, res)) return;

    const { q, status, branchId } = req.query;
    const { page, limit, skip } = getPagination(req.query, 20, 100);
    const query = {};
    const queryText = String(q || "").trim();

    if (status) {
      query.status = status;
    }

    if (branchId && mongoose.Types.ObjectId.isValid(branchId)) {
      query.branch = new mongoose.Types.ObjectId(branchId);
    }

    if (queryText) {
      const regex = new RegExp(queryText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = [
        { note: regex },
        { "customer.name": regex },
        { "customer.phone": regex },
      ];

      if (mongoose.Types.ObjectId.isValid(queryText)) {
        query.$or.push({ _id: new mongoose.Types.ObjectId(queryText) });
      }
    }

    const [loans, total] = await Promise.all([
      FinancialTransaction.find({ ...query, type: "loan" })
        .populate("customer", "name phone")
        .populate("branch", "name area")
        .populate("createdBy", "name role")
        .populate("approvedBy", "name role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      FinancialTransaction.countDocuments({ ...query, type: "loan" }),
    ]);

    return res.json({ loans, pagination: { page, limit, total } });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updateLoanStatus(req, res, next) {
  try {
    if (!requireAdminOrBranchManager(req, res)) return;

    const { loanId } = req.params;
    const { status } = req.body;

    if (!loanId) {
      return res.status(400).json({ message: "loanId is required" });
    }

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

async function listAuditLogs(req, res, next) {
  try {
    const { page, limit, skip } = getPagination(req.query, 30, 200);
    const query = {};

    // Action filter (LOGIN, CREATE, UPDATE, DELETE, API_CALL)
    if (req.query.action) {
      query.action = String(req.query.action).toUpperCase();
    }

    // Module filter
    if (req.query.module) {
      query.module = new RegExp(String(req.query.module).trim(), "i");
    }

    // Method filter
    if (req.query.method) {
      query.method = String(req.query.method).toUpperCase();
    }

    // Status code filter
    if (req.query.statusCode) {
      query.statusCode = Number(req.query.statusCode);
    }

    // Resource ID filter
    if (req.query.resourceId) {
      query.$or = [
        { resourceId: req.query.resourceId },
        { relatedResourceId: req.query.resourceId },
      ];
    }

    // Date range filter
    if (req.query.startDate || req.query.endDate) {
      query.createdAt = {};
      if (req.query.startDate) query.createdAt.$gte = new Date(req.query.startDate);
      if (req.query.endDate)   query.createdAt.$lte = new Date(req.query.endDate);
    }

    // Full text search: description, path, user name/phone
    const q = String(req.query.q || "").trim();
    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      const searchOr = [
        { description: regex },
        { path: regex },
        { ip: regex },
        { module: regex },
        { "performedBy.name": regex },
        { "performedBy.phone": regex },
      ];
      // If query already has $or (resourceId), merge with $and
      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchOr }];
        delete query.$or;
      } else {
        query.$or = searchOr;
      }
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .populate("performedBy", "name phone role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AuditLog.countDocuments(query),
    ]);

    return res.json({
      logs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getTransactionAuditLogs(req, res, next) {
  try {
    const { transactionId } = req.params;
    if (!transactionId) return res.status(400).json({ message: "transactionId is required" });

    const { page, limit, skip } = getPagination(req.query, 30, 200);

    const query = { $or: [{ resourceId: transactionId }, { relatedResourceId: transactionId }] };

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .populate("performedBy", "name phone role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AuditLog.countDocuments(query),
    ]);

    return res.json({ logs, pagination: { page, limit, total } });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function exportSystemData(req, res, next) {
  try {
    const includeRecords = req.query.includeRecords === "true";

    const [branchesCount, usersCount, customersCount, financialTransactionsCount, depositsCount, loansCount, withdrawalsCount, loanPaymentsCount, messagesCount, auditLogsCount, verifiedKycCount, pendingKycCount, rejectedKycCount] =
      await Promise.all([
        Branch.countDocuments(),
        User.countDocuments(),
        Customer.countDocuments(),
        FinancialTransaction.countDocuments(),
        FinancialTransaction.countDocuments({ type: "deposit" }),
        FinancialTransaction.countDocuments({ type: "loan" }),
        FinancialTransaction.countDocuments({ type: "withdrawal" }),
        FinancialTransaction.countDocuments({ type: "loan_payment" }),
        Message.countDocuments(),
        AuditLog.countDocuments(),
        User.countDocuments({ kycStatus: "verified" }),
        User.countDocuments({ kycStatus: "pending" }),
        User.countDocuments({ kycStatus: "rejected" }),
      ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      counts: {
        branches: branchesCount,
        users: usersCount,
        customers: customersCount,
        financialTransactions: financialTransactionsCount,
        deposits: depositsCount,
        loans: loansCount,
        withdrawals: withdrawalsCount,
        loanPayments: loanPaymentsCount,
        messages: messagesCount,
        auditLogs: auditLogsCount,
        kycVerified: verifiedKycCount,
        kycPending: pendingKycCount,
        kycRejected: rejectedKycCount,
      },
    };

    if (includeRecords) {
      const [branches, users, customers, transactions, messages] = await Promise.all([
        Branch.find().lean(),
        User.find().select("-pin").lean(),
        Customer.find().lean(),
        FinancialTransaction.find().populate("customer", "name phone").populate("branch", "name").lean(),
        Message.find().lean(),
      ]);

      payload.records = {
        branches,
        users,
        customers,
        financialTransactions: transactions,
        messages,
      };
    }

    return res.json(payload);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  getMeta,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  createBranch,
  updateBranch,
  deleteBranch,
  listBranches,
  listUsers,
  listBranchCustomers,
  createUser,
  updateUser,
  deleteUser,
  updateUserKyc,
  listBranchAdmins,
  createBranchAdmin,
  updateBranchAdmin,
  deleteBranchAdmin,
  getDashboardSummary,
  getTransactions,
  getTransactionById,
  getTransactionAuditLogs,
  getTransactionTotals,
  getBranchPerformance,
  listLoans,
  updateLoanStatus,
  listAuditLogs,
  exportSystemData,
  getUserSummary,
  getUserDetails,
  createUserWithdrawal,
  createUserLoanPayment,
  getSettings,
  updateSettings,
};

