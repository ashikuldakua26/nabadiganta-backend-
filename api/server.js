"use strict";

// ─── MUST BE FIRST: set env vars before ANY other require() ──────────────────
// On Vercel, these env vars should also be set in the dashboard.
// The values below are fallbacks so the app works even without dashboard config.

try {
  require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
} catch (_) {}

// Inject fallbacks directly into process.env
process.env.MONGODB_URI = process.env.MONGODB_URI
  || "mongodb+srv://pwa_control:iucnr75i0ZYqv9xs@pwa0.6uuafq9.mongodb.net/nabadiganta";

process.env.JWT_SECRET = process.env.JWT_SECRET
  || "nabadiganta_ngo_jwt_secret_2024_secure_key";

process.env.NODE_ENV = process.env.NODE_ENV || "production";

// ─── MongoDB (MUST connect before requiring app so models are ready) ──────────
const mongoose = require("mongoose");

let cachedConn = null;

async function connectDB() {
  // Already connected on a warm invocation
  if (mongoose.connection.readyState === 1) return;

  // Connection in progress — wait
  if (cachedConn) {
    cachedConn = await cachedConn;
    return;
  }

  cachedConn = mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 8000,
    socketTimeoutMS:          30000,
    maxPoolSize:              5,
    minPoolSize:              1,
    // bufferCommands defaults to true — do NOT set it to false
  });

  await cachedConn;
  console.log("✅ MongoDB:", mongoose.connection.host);
}

// ─── Lazy app loader ──────────────────────────────────────────────────────────
// We delay require('../app') until AFTER connectDB() so that:
// 1. JWT_SECRET is already in process.env when token.js loads
// 2. Mongoose models are connected before first query
let _app = null;
function getApp() {
  if (!_app) _app = require("../app");
  return _app;
}

// ─── Vercel serverless handler ────────────────────────────────────────────────
module.exports = async (req, res) => {
  // CORS — belt + suspenders (app.js also sets these via cors())
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,Accept");

  if (req.method === "OPTIONS") return res.status(204).end();

  // Connect to MongoDB first
  try {
    await connectDB();
  } catch (err) {
    console.error("❌ DB connect failed:", err.message);
    return res.status(503).json({
      message: "Database unavailable. Please try again in a few seconds.",
      code: "DB_ERROR",
    });
  }

  // Delegate to Express
  return getApp()(req, res);
};
