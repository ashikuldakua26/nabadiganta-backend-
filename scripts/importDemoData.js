require("dotenv").config();
const mongoose = require("mongoose");
const { seedDemoData } = require("../helpers/demoSeeder");

const args = process.argv.slice(2);
const keepExisting = args.includes("--keep");
const verbose = args.includes("--verbose");
const count = args.find(arg => arg.startsWith("--customers="))?.split("=")?.[1] || 12;

function log(message, type = "info") {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: "ℹ️ ",
    success: "✅",
    warning: "⚠️ ",
    error: "❌",
  }[type] || "→ ";
  console.log(`${prefix} [${timestamp}] ${message}`);
}

async function run() {
  try {
    log(`Starting demo data import...`);
    log(`Mode: ${keepExisting ? "Keep existing data" : "Replace all data"}`);
    log(`Customers per branch: ${count}`);

    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is not set in environment");
    }

    log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    log("Connected to MongoDB", "success");

    log("Seeding demo data...");
    const result = await seedDemoData({ 
      replaceExisting: !keepExisting,
      customersPerBranch: parseInt(count),
      verbose 
    });

    if (result.skipped) {
      log(result.reason, "warning");
    } else {
      log("Demo data created successfully", "success");
      log("\n📊 Summary:", "success");
      Object.entries(result.summary).forEach(([key, value]) => {
        log(`  • ${key}: ${value}`, "info");
      });

      log("\n🔐 Test Credentials:", "success");
      log(`  Admin: +${result.credentials.admin.phone} / PIN: ${result.credentials.admin.pin}`, "info");
      log(`  Branch Manager: +${result.credentials.branchManager.phone} / PIN: ${result.credentials.branchManager.pin}`, "info");
    }
  } catch (error) {
    log(`Fatal error: ${error.message}`, "error");
    if (verbose) {
      console.error(error);
    }
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    log("Disconnected from MongoDB");
    process.exit(0);
  }
}

run();
