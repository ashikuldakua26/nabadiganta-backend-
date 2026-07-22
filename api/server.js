"use strict";

// ─── Step 1: Inject env vars FIRST — before any other require() ──────────────
// Vercel: set these in dashboard → Project → Settings → Environment Variables
// Local:  they come from .env file below
try {
  require("dotenv").config({
    path: require("path").join(__dirname, "../.env"),
  });
} catch (_) {}

// Hard-coded fallbacks — work even if Vercel dashboard is not configured
if (!process.env.MONGODB_URI) {
  process.env.MONGODB_URI =
    "mongodb+srv://pwa_control:iucnr75i0ZYqv9xs@pwa0.6uuafq9.mongodb.net/nabadiganta";
}
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "nabadiganta_ngo_jwt_secret_2024_secure_key";
}
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "production";
}

// ─── Step 2: MongoDB connection — cached across warm invocations ─────────────
const mongoose = require("mongoose");

// Single pending promise — prevents multiple parallel connection attempts
let _connectPromise = null;

function connectDB() {
  // Already connected
  if (mongoose.connection.readyState === 1) {
    return Promise.resolve();
  }
  // Reuse in-flight connection
  if (_connectPromise) {
    return _connectPromise;
  }

  _connectPromise = mongoose
    .connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 5,
      minPoolSize: 1,
      // IMPORTANT: never set bufferCommands: false — that causes the timeout error
    })
    .then((conn) => {
      console.log("✅ MongoDB connected:", conn.connection.host);
      _connectPromise = null; // clear so reconnect works after a drop
      return conn;
    })
    .catch((err) => {
      _connectPromise = null; // clear so next request retries
      throw err;
    });

  return _connectPromise;
}

// ─── Step 3: Load Express app AFTER env vars are set ─────────────────────────
// This ensures JWT_SECRET is available when helpers/token.js loads
let _app = null;
function getApp() {
  if (!_app) {
    _app = require("../app");
  }
  return _app;
}

// ─── Step 4: Vercel serverless handler ───────────────────────────────────────
module.exports = async function handler(req, res) {
  // CORS headers on every response
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,Authorization,Accept,X-Requested-With"
  );

  // Handle preflight
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  // Connect to DB (fast no-op on warm instances)
  try {
    await connectDB();
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    res.status(503).json({
      message: "Database is unavailable. Please try again in a few seconds.",
      code: "DB_CONNECTION_ERROR",
    });
    return;
  }

  // Hand off to Express
  getApp()(req, res);
};
