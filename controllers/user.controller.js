const Customer = require("../models/Customer");
const FinancialTransaction = require("../models/FinancialTransaction");
const Message = require("../models/Message");
const mongoose = require("mongoose");
const { getPagination } = require("../helpers/validators");

function getBranchId(req) {
  const raw = req.user.branchId || req.query.branchId;
  if (!raw) return null;
  const str = raw.toString();
  return mongoose.Types.ObjectId.isValid(str) ? new mongoose.Types.ObjectId(str) : null;
}

async function listCustomers(req, res) {
  try {
    const branchId = getBranchId(req);
    const { page, limit, skip } = getPagination(req.query, 20, 100);
    const query = { branch: branchId, isActive: true };
    const [customers, total] = await Promise.all([
      Customer.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Customer.countDocuments(query),
    ]);
    return res.json({ customers, pagination: { page, limit, total } });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function myDeposits(req, res) {
  try {
    const branchId = getBranchId(req);
    const { page, limit, skip } = getPagination(req.query, 20, 100);
    const query = { branch: branchId, type: "deposit" };
    const [deposits, total] = await Promise.all([
      FinancialTransaction.find(query)
        .populate("customer", "name")
        .sort({ collectedAt: -1 })
        .skip(skip)
        .limit(limit),
      FinancialTransaction.countDocuments(query),
    ]);
    return res.json({ deposits, pagination: { page, limit, total } });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function myLoans(req, res) {
  try {
    const branchId = getBranchId(req);
    const { page, limit, skip } = getPagination(req.query, 20, 100);
    const query = { branch: branchId, type: "loan" };
    const [loans, total] = await Promise.all([
      FinancialTransaction.find(query).populate("customer", "name").sort({ createdAt: -1 }).skip(skip).limit(limit),
      FinancialTransaction.countDocuments(query),
    ]);
    return res.json({ loans, pagination: { page, limit, total } });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function sendMessage(req, res) {
  try {
    const branchId = getBranchId(req);
    const { customerId, type, body } = req.body;

    if (!customerId || !type || !body) {
      return res.status(400).json({ message: "customerId, type, body are required" });
    }

    if (!["deposit", "loan"].includes(type)) {
      return res.status(400).json({ message: "Only deposit and loan message types are allowed" });
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

module.exports = {
  listCustomers,
  myDeposits,
  myLoans,
  sendMessage,
};
