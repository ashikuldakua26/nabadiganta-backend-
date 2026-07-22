require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  require('../models/User');
  require('../models/Customer');
  require('../models/Branch');
  const FinancialTransaction = require('../models/FinancialTransaction');

  const txs = await FinancialTransaction.find().sort({ createdAt: -1 }).limit(5)
    .populate('customer', 'name phone')
    .populate('branch', 'name')
    .populate('createdBy', 'name phone role')
    .populate('approvedBy', 'name phone role');

  console.log('Sample Transactions:');
  txs.forEach(tx => {
    console.log('---');
    console.log('Type:', tx.type, 'Amount:', tx.amount);
    console.log('Customer:', tx.customer?.name, tx.customer?._id);
    console.log('Branch:', tx.branch?.name);
    console.log('CreatedBy:', tx.createdBy ? `${tx.createdBy.name} (${tx.createdBy.phone})` : '');
    console.log('ApprovedBy:', tx.approvedBy ? `${tx.approvedBy.name} (${tx.approvedBy.phone})` : '');
    console.log('Status:', tx.status, 'BalanceStatus:', tx.balanceStatus);
  });

  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
