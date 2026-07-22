#!/bin/bash
# Quick Demo Seeder Commands - Copy & Paste

# 1. Fresh demo data (replace all)
node scripts/importDemoData.js

# 2. Keep existing data & add more
node scripts/importDemoData.js --keep

# 3. Create larger dataset (50 customers per branch)
node scripts/importDemoData.js --customers=50

# 4. Debug mode with detailed logs
node scripts/importDemoData.js --verbose

# 5. Large dataset + keep + debug
node scripts/importDemoData.js --customers=100 --keep --verbose

# 6. Reset with 20 customers per branch
node scripts/importDemoData.js --customers=20

# Test the seed endpoint via API
# curl -X POST http://localhost:3000/api/admin/seed

# View generated test credentials in logs ✅
