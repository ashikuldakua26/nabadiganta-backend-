"use strict";

// Load .env for local development
// On Vercel, env vars are injected via Vercel dashboard → Settings → Environment Variables
try { require("dotenv").config({ path: require("path").join(__dirname, "../.env") }); } catch (_) {}

const mongoose = require("mongoose");

// ─── MongoDB URI fallback (used only if Vercel env var is not set) ────────────
// Set MONGODB_URI in Vercel dashboard to override this default
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://pwa_control:iucnr75i0ZYqv9xs@pwa0.6uuafq9.mongodb.net/nabadiganta";

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "nabadiganta_ngo_jwt_secret_2024_secure_key";

// Inject into process.env so all modules can read them
if (!process.env.MONGODB_URI) process.env.MONGODB_URI = MONGODB_URI;
if (!process.env.JWT_SECRET)  process.env.JWT_SECRET  = JWT_SECRET;

// ─── Cached connection (survives warm Vercel invocations) ─────────────────────
let cachedConn = null;

async function connectDB() {
  if (cachedConn && mongoose.connection.readyState === 1) return cachedConn;

  const conn = await mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS:          45000,
    connectTimeoutMS:         15000,
    maxPoolSize:              5,
    minPoolSize:              1,
    // NOTE: do NOT set bufferCommands: false — that causes the buffering timeout error
  });

  cachedConn = conn;
  console.log("✅ MongoDB connected:", mongoose.connection.host);
  return conn;
}

// ─── Express app (lazy-loaded once per container) ─────────────────────────────
let expressApp;
function getApp() {
  if (!expressApp) expressApp = require("../app");
  return expressApp;
}

// ─── Vercel serverless handler ────────────────────────────────────────────────
module.exports = async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,Accept");

  if (req.method === "OPTIONS") return res.status(204).end();

  // Connect to MongoDB
  try {
    await connectDB();
  } catch (err) {
    console.error("❌ DB connection failed:", err.message);
    return res.status(503).json({
      success: false,
      error: {
        message: "Database connection failed. Please try again.",
        code: "DB_CONNECTION_ERROR",
      },
    });
  }

  return getApp()(req, res);
};
