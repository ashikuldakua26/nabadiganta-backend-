const Branch = require("../models/Branch");
const User = require("../models/User");
const Customer = require("../models/Customer");
const FinancialTransaction = require("../models/FinancialTransaction");
const Message = require("../models/Message");
const AuditLog = require("../models/AuditLog");
const { USER_ROLES } = require("./constants");

// Helper to generate random dates
function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60), 0, 0);
  return d;
}

// Random utility functions
function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Bangladeshi names for realism
const firstNames = [
  "আব্দুল", "করিম", "রহিম", "ফারহান", "সাদিক", "হাসান", "হোসেন", "সালাম", 
  "নাজিম", "জামিল", "সালিম", "মেহেদী", "কাউসার", "ইকবাল", "মোহাম্মদ",
  "রহিমা", "ফাতিমা", "আয়েশা", "জেসমিন", "নাজমা", "রুমানা", "সালমা",
];

const lastNames = [
  "আহমেদ", "খান", "চৌধুরী", "মিয়া", "সরদার", "রায়", "হোসেন", "আলী",
  "শেখ", "মাহমুদ", "করিম", "সিদ্দিকী", "সাইদ", "জামান",
];

const areas = [
  "ধানমন্ডি", "গুলশন", "বনানী", "মোহাখালি", "উত্তর হালিশহর",
  "পুরান ঢাকা", "গ্রিনরোড", "ধাকা শহর", "কামরানগীর চর", "সংসদ নগর"
];

function generateName() {
  return `${randomItem(firstNames)} ${randomItem(lastNames)}`;
}

function generatePhone(prefix = "01") {
  const second = randomBetween(1, 9);
  const rest = String(randomBetween(1000000, 9999999)).padStart(7, "0");
  return `${prefix}${second}${rest}`;
}

const depositNotes = [
  "নিয়মিত সঞ্চয়",
  "মাসিক জমা",
  "কিস্তি পরিশোধ",
  "লাভের অংশ",
  "সঞ্চয় প্রোগ্রাম",
  "বিশেষ জমা",
  "বোনাস পরিমাণ",
];

const loanPurposes = [
  "ব্যবসায় সম্প্রসারণ", "গৃহ নির্মাণ", "শিক্ষা খরচ", "কৃষি প্রকল্প",
  "পরিবহন ক্রয়", "যন্ত্রপাতি ক্রয়", "স্বাস্থ্যসেবা", "জরুরি ব্যয়",
];

async function clearAllData() {
  await Promise.all([
    Message.deleteMany({}),
    FinancialTransaction.deleteMany({}),
    Customer.deleteMany({}),
    User.deleteMany({}),
    Branch.deleteMany({}),
    AuditLog?.deleteMany?.({}).catch(() => null), // Optional if AuditLog exists
  ]);
}

async function seedDemoData(options = {}) {
  const { replaceExisting = true, customersPerBranch = 12, verbose = false } = options;

  if (replaceExisting) {
    await clearAllData();
  }

  const existingUsers = await User.countDocuments();
  if (!replaceExisting && existingUsers > 0) {
    return {
      skipped: true,
      reason: "Data exists. Pass replaceExisting=true to overwrite.",
    };
  }

  // Create branches with real Bangladeshi areas
  const branches = await Branch.create([
    { name: "উত্তর হালিশহর শাখা", area: "উত্তর হালিশহর" },
    { name: "গুলশন শাখা", area: "গুলশন" },
    { name: "ধানমন্ডি শাখা", area: "ধানমন্ডি" },
  ]);

  // Create superadmin and admin users
  const superAdmin = await User.create({
    name: "সুপার অ্যাডমিন",
    phone: "01349828722",
    pin: "1234",
    role: USER_ROLES.SUPER_ADMIN,
    area: "প্রধান কার্যালয়",
  });

  const admin = await User.create({
    name: "প্রশাসক",
    phone: "01349828721",
    pin: "1234",
    role: USER_ROLES.ADMIN,
    area: "প্রধান কার্যালয়",
  });

  // Create branch managers
  const branchManagers = await User.create([
    {
      name: generateName(),
      phone: "01700000001",
      pin: "1234",
      role: USER_ROLES.BRANCH_MANAGER,
      area: branches[0].area,
      branch: branches[0]._id,
    },
    {
      name: generateName(),
      phone: "01700000002",
      pin: "1234",
      role: USER_ROLES.BRANCH_MANAGER,
      area: branches[1].area,
      branch: branches[1]._id,
    },
    {
      name: generateName(),
      phone: "01700000003",
      pin: "1234",
      role: USER_ROLES.BRANCH_MANAGER,
      area: branches[2].area,
      branch: branches[2]._id,
    },
  ]);

  // Create staff members
  const staffs = await User.create(
    branches.flatMap((branch, branchIdx) => 
      Array.from({ length: 2 }).map((_, staffIdx) => ({
        name: generateName(),
        phone: generatePhone("017"),
        pin: "1234",
        role: USER_ROLES.STAFF,
        area: branch.area,
        branch: branch._id,
      }))
    )
  );

  // Create general users
  const users = await User.create(
    branches.flatMap((branch, branchIdx) => 
      Array.from({ length: 2 }).map((_, userIdx) => ({
        name: generateName(),
        phone: generatePhone("018"),
        pin: "1234",
        role: USER_ROLES.USER,
        area: branch.area,
        branch: branch._id,
      }))
    )
  );

  // Create customers with more realistic data
  const customerDocs = [];
  branches.forEach((branch, branchIndex) => {
    for (let i = 1; i <= customersPerBranch; i += 1) {
      customerDocs.push({
        name: generateName(),
        phone: generatePhone("019"),
        area: branch.area,
        branch: branch._id,
        createdBy: branchManagers[branchIndex]._id,
        createdAt: daysAgo(randomBetween(1, 30)),
      });
    }
  });

  const customers = await Customer.insertMany(customerDocs);

  const deposits = [];
  const loans = [];
  const messages = [];

  // Create varied transactions
  customers.forEach((customer, index) => {
    const branchIdx = branches.findIndex((b) => String(b._id) === String(customer.branch));
    const manager = branchManagers[Math.max(0, branchIdx)];

    // Multiple deposits per customer
    const numDeposits = randomBetween(2, 4);
    for (let d = 0; d < numDeposits; d++) {
      deposits.push({
        type: "deposit",
        customer: customer._id,
        branch: customer.branch,
        amount: randomBetween(200, 2000),
        note: randomItem(depositNotes),
        createdBy: manager._id,
        transactionDate: daysAgo(randomBetween(1, 30)),
        collectedAt: daysAgo(randomBetween(1, 30)),
      });
    }

    // Loans with variety
    if (index % 3 !== 0) { // Not all customers have loans
      const loanAmount = randomBetween(5000, 50000);
      const loanStatus = randomItem(["passed", "applied", "absent", "rejected"]);
      
      deposits.push({
        type: "loan",
        customer: customer._id,
        branch: customer.branch,
        amount: loanAmount,
        status: loanStatus,
        note: randomItem(loanPurposes),
        createdBy: manager._id,
        approvedBy: loanStatus === "passed" ? manager._id : null,
        transactionDate: daysAgo(randomBetween(1, 30)),
        appliedAt: daysAgo(randomBetween(1, 45)),
        paidAmount: loanStatus === "passed" ? randomBetween(0, loanAmount / 2) : 0,
        outstandingAmount: loanStatus === "passed" ? loanAmount - randomBetween(0, loanAmount / 2) : loanAmount,
        // Ensure balanceStatus uses valid enum values ('active' or 'completed')
        balanceStatus: "active",
      });
    }

    // Messages for active transactions
    if (randomBetween(1, 10) > 4) {
      messages.push({
        customer: customer._id,
        branch: customer.branch,
        sentBy: manager._id,
        type: randomItem(["deposit", "loan"]),
        body: randomItem([
          "আপনার সম্প্রতি জমা নিশ্চিত করুন।",
          "আপনার ঋণ পর্যালোচনা চলছে।",
          "কিস্তি পরিশোধের সময় আসছে।",
          "নতুন সঞ্চয় প্রোগ্রামে যোগ দিন।",
          "আপনার অ্যাকাউন্ট আপডেট করুন।",
        ]),
      });
    }
  });

  const financialTransactions = deposits;

  // Batch insert all data
  await Promise.all([
    FinancialTransaction.insertMany(financialTransactions),
    Message.insertMany(messages),
  ]);

  // Log audit entries if AuditLog exists
  try {
    if (AuditLog) {
      await AuditLog.create({
        action: "DEMO_DATA_SEEDED",
        module: "SYSTEM",
        description: `Demo data seeded with ${customers.length} customers and ${financialTransactions.length} transactions`,
        performedBy: admin._id,
        timestamp: new Date(),
      });
    }
  } catch (e) {
    // Silently fail if AuditLog model doesn't exist
  }

  return {
    skipped: false,
    summary: {
      branches: branches.length,
      users: 3 + branchManagers.length + staffs.length + users.length,
      customers: customers.length,
      transactions: financialTransactions.length,
      deposits: financialTransactions.filter(t => t.type === "deposit").length,
      loans: financialTransactions.filter(t => t.type === "loan").length,
      messages: messages.length,
    },
    credentials: {
      admin: { phone: admin.phone, pin: "1234", name: admin.name },
      branchManager: { phone: branchManagers[0].phone, pin: "1234", name: branchManagers[0].name },
    },
  };
}

module.exports = {
  seedDemoData,
};
