require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  // Ensure related models are registered so populate works
  require('../models/User');
  const AuditLog = require('../models/AuditLog');

  const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(10).populate('performedBy', 'name phone role');
  console.log('Recent Audit Logs:');
  logs.forEach((log) => {
    console.log('---');
    console.log('Action:', log.action);
    console.log('Module:', log.module);
    console.log('PerformedBy:', log.performedBy ? `${log.performedBy.name} (${log.performedBy.phone}) [${log.performedBy.role}]` : 'Unknown');
    console.log('Description:', log.description);
    console.log('CreatedAt:', log.createdAt);
  });

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
