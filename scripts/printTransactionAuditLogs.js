require('dotenv').config();
const mongoose = require('mongoose');
const { getResourceAuditLogs } = require('../helpers/audit');

async function run() {
  const id = process.argv[2];
  if (!id) {
    console.error('Usage: node scripts/printTransactionAuditLogs.js <transactionId>');
    process.exit(1);
  }

  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const logs = await getResourceAuditLogs(id, 50, 0);
  console.log(`Found ${logs.length} audit logs for resource ${id}`);
  logs.slice(0, 10).forEach(l => {
    console.log('---');
    console.log(l.action, l.module, l.description, l.performedBy);
  });

  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
