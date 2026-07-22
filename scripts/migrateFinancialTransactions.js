const FinancialTransaction = require("../models/FinancialTransaction");

async function migrateLegacyFinancialData() {
  try {
    const existingCount = await FinancialTransaction.countDocuments();
    if (existingCount > 0) {
      return { migrated: 0, skipped: true, message: "Financial transactions already seeded in the shared model" };
    }

    return { migrated: 0, skipped: true, message: "Legacy financial migration is no longer required" };
  } catch (error) {
    console.error("Legacy financial migration failed", error.message);
    return { migrated: 0, skipped: true, error: error.message };
  }
}

module.exports = { migrateLegacyFinancialData };
