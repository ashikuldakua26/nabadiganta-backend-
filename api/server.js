"use strict";

// ─── Production Vercel entry point ───────────────────────────────────────────
// Vercel calls this file as a serverless function.
// Each request: connect DB (cached) → delegate to Express app.

// Load .env for local testing of this file; on Vercel env vars are injected.
try { require("dotenv").config({ path: require("path").join(__dirname, "../.env") }); } catch (_) {}

// ─── Hard-coded fallbacks so Vercel works without dashboard env vars ──────────
if (!process.env.MONGODB_URI) {
  process.env.MONGODB_URI = "mongodb+srv://pwa_control:iucnr75i0ZYqv9xs@pwa0.6uuafq9.mongodb.net/nabadiganta";
}
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "nabadiganta_ngo_jwt_secret_2024_secure_key";
}

// ─── Load app AFTER env vars are set (JWT_SECRET must be available) ──────────
const mongoose = require("mongoose");
const app      = require("../app");

// ─── MongoDB connection cache ─────────────────────────────────────────────────
let cachedConn = null;

async function connectDB() {
  if (cachedConn && mongoose.connection.readyState === 1) return;

  cachedConn = await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS:          45000,
    maxPoolSize:              5,
    minPoolSize:              1,
  });

  console.log("✅ MongoDB:", mongoose.connection.host);
}

// ─── Vercel handler ───────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,Accept");

  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    await connectDB();
  } catch (err) {
    console.error("❌ DB:", err.message);
    return res.status(503).json({ message: "Database unavailable. Please retry.", code: "DB_ERROR" });
  }

  return app(req, res);
};
