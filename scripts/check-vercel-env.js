/**
 * Vercel Environment Variables Checker
 * Run: node scripts/check-vercel-env.js
 *
 * This script verifies your local .env matches what Vercel needs.
 * Add the missing vars at: https://vercel.com/dashboard → your project → Settings → Environment Variables
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const REQUIRED = [
  { key: "MONGODB_URI",  secret: true,  hint: "MongoDB Atlas connection string" },
  { key: "JWT_SECRET",   secret: true,  hint: "At least 32 random characters" },
  { key: "NODE_ENV",     secret: false, hint: 'Set to "production" on Vercel' },
];

const OPTIONAL = [
  { key: "PORT",         hint: "Not needed on Vercel (ignored)" },
  { key: "CORS_ORIGIN",  hint: "Leave empty to allow all origins, or set your app domain" },
];

console.log("\n🔍  Checking environment variables for Vercel deployment…\n");

let allGood = true;

for (const v of REQUIRED) {
  const val = process.env[v.key];
  if (!val) {
    console.log(`❌  MISSING  ${v.key.padEnd(20)} ← ${v.hint}`);
    allGood = false;
  } else {
    const display = v.secret ? `${val.slice(0, 8)}…` : val;
    console.log(`✅  OK       ${v.key.padEnd(20)} = ${display}`);
  }
}

console.log("");
for (const v of OPTIONAL) {
  const val = process.env[v.key];
  console.log(`ℹ️   OPTIONAL ${v.key.padEnd(20)} ${val ? "= " + (val.length > 20 ? val.slice(0,20)+"…" : val) : "(not set) — " + v.hint}`);
}

console.log("\n" + (allGood
  ? "✅  All required variables are set locally.\n   Make sure to add them to Vercel too!\n"
  : "❌  Some required variables are missing.\n   Add them to Vercel: vercel.com → project → Settings → Environment Variables\n"
));

console.log("📋  Copy these values to Vercel Environment Variables:");
console.log("─".repeat(55));
for (const v of REQUIRED) {
  const val = process.env[v.key];
  if (val) console.log(`   ${v.key} = ${v.secret ? "[see your .env file]" : val}`);
}
console.log("─".repeat(55));
console.log("\n");
