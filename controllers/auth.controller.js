const Branch = require("../models/Branch");
const User = require("../models/User");
const Settings = require("../models/settings.Models");
const { USER_ROLES } = require("../helpers/constants");
const { generateToken } = require("../helpers/token");
const { isValidPin, normalizePhone } = require("../helpers/validators");
const { getHourInTimezone } = require("../helpers/timezone");
const { seedDemoData } = require("../helpers/demoSeeder");

async function login(req, res) {
  try {
    const phoneInput = req.body.phone || req.body.phoneNumber || req.body.identifier;
    const phone = normalizePhone(phoneInput);
    const pin = String(req.body.pin || "").trim();
    if (!phone || !pin) {
      return res.status(400).json({ message: "phone and pin are required" });
    }

    if (!isValidPin(pin)) {
      return res.status(400).json({ message: "PIN must be 4 digits" });
    }

    const user = await User.findOne({ phone, isActive: true }).populate("branch");
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const pinMatched = await user.comparePin(pin);
    if (!pinMatched) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // ─── Check role-based login permissions from Settings ───────────────────
    const settings = await Settings.findOne().lean();
    const perm = settings?.permissions || {};

    if (user.role === USER_ROLES.USER && perm.allowUserLogin === false) {
      return res.status(403).json({ message: "User login is currently disabled." });
    }
    if (user.role === USER_ROLES.BRANCH_MANAGER && perm.allowBranchAdminLogin === false) {
      return res.status(403).json({ message: "Branch manager login is currently disabled." });
    }
    if (user.role === USER_ROLES.ADMIN && perm.allowAdminLogin === false) {
      return res.status(403).json({ message: "Admin login is currently disabled." });
    }

    // ─── Branch manager login window check ─────────────────────────────────
    if (user.role === USER_ROLES.BRANCH_MANAGER) {
      const lw = settings?.loginWindow || {};
      if (lw.branchManagerEnabled !== false) {
        const hour = getHourInTimezone(lw.timezone || "Asia/Dhaka");
        const start = lw.startHour ?? 8;
        const end = lw.endHour ?? 23;
        if (hour < start || hour >= end) {
          return res.status(403).json({
            message: `Branch manager login is restricted to ${String(start).padStart(2, "0")}:00–${String(end).padStart(2, "0")}:00 (${lw.timezone || "Asia/Dhaka"}).`,
          });
        }
      }
    }

    const token = generateToken(user);
    return res.json({
      success: true,
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          phone: user.phone,
          role: user.role,
          area: user.area,
          branch: user.branch,
        },
      },
      message: "Login successful",
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function profile(req, res) {
  try {
    const user = await User.findById(req.user.id).populate("branch").select("-pin");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({ success: true, data: { user } });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function register(req, res) {
  try {
    const { name, pin, role, branchId, area } = req.body;
    const phone = normalizePhone(req.body.phone);
    if (!name || !phone || !pin || !role) {
      return res.status(400).json({ message: "name, phone, pin, role are required" });
    }

    if (!Object.values(USER_ROLES).includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    if (!isValidPin(pin)) {
      return res.status(400).json({ message: "PIN must be 4 digits" });
    }

    const existing = await User.findOne({ phone });
    if (existing) {
      return res.status(409).json({ message: "Phone already exists" });
    }

    const user = await User.create({
      name,
      phone,
      pin,
      role,
      branch: branchId || null,
      area: area || "",
    });

    return res.status(201).json({
      message: "User created",
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function changePin(req, res) {
  try {
    const { currentPin, newPin } = req.body;
    if (!currentPin || !newPin) {
      return res.status(400).json({ message: "currentPin and newPin are required" });
    }

    if (!isValidPin(newPin)) {
      return res.status(400).json({ message: "newPin must be 4 digits" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const pinMatched = await user.comparePin(currentPin);
    if (!pinMatched) {
      return res.status(401).json({ message: "Current PIN is incorrect" });
    }

    user.pin = newPin;
    await user.save();

    return res.json({ message: "PIN changed successfully" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function seedDefaults(req, res) {
  try {
    const superAdminExists = await User.findOne({ role: USER_ROLES.SUPER_ADMIN });
    if (superAdminExists) {
      return res.status(200).json({ message: "Default data already exists" });
    }

    const defaultBranch = await Branch.create({
      name: "Uttor Mugda Branch",
      area: "uttor mugda",
    });

    const superAdmin = await User.create({
      name: "Super Admin",
      phone: "01349828721",
      pin: "1234",
      role: USER_ROLES.SUPER_ADMIN,
      area: "head office",
    });

    const branchManager = await User.create({
      name: "putul",
      phone: "01700000001",
      pin: "1234",
      role: USER_ROLES.BRANCH_MANAGER,
      area: "uttor mugda",
      branch: defaultBranch._id,
    });

    return res.status(201).json({
      message: "Default superadmin and branch manager created",
      defaults: {
        superAdmin: {
          id: superAdmin._id,
          phone: superAdmin.phone,
          pin: "1234",
        },
        branchManager: {
          id: branchManager._id,
          phone: branchManager.phone,
          pin: "1234",
          branch: defaultBranch.name,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function importDemoData(req, res) {
  try {
    const replaceExisting = req.body?.replaceExisting !== false;
    const result = await seedDemoData({ replaceExisting });
    return res.status(201).json({
      message: result.skipped ? "Demo import skipped" : "Demo data imported successfully",
      ...result,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function logout(req, res) {
  return res.json({ message: "Logged out successfully" });
}

module.exports = {
  login,
  profile,
  register,
  changePin,
  logout,
  seedDefaults,
  importDemoData,
};
