require('dotenv').config();
const mongoose = require('mongoose');
const FinancialTransaction = require('../models/FinancialTransaction');

async function run() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const tx = await FinancialTransaction.findOne().lean();
  if (!tx) {
    console.error('No transactions found');
    process.exit(1);
  }
  console.log(String(tx._id));
  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
