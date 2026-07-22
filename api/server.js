"use strict";

// Load .env for local dev only (Vercel injects env vars automatically)
try {
  require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
} catch (_) {}

const express  = require("express");
const cors     = require("cors");
const mongoose = require("mongoose");

// ─── Inject credentials directly so Vercel always has them ───────────────────
// These values are used when the Vercel env var is NOT set.
// For security, also add them to: vercel.com → project → Settings → Environment Variables
if (!process.env.MONGODB_URI) {
  process.env.MONGODB_URI = "mongodb+srv://pwa_control:iucnr75i0ZYqv9xs@pwa0.6uuafq9.mongodb.net/nabadiganta";
}
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "nabadiganta_ngo_jwt_secret_2024_secure_key";
}

// ─── Routes ───────────────────────────────────────────────────────────────────
const authRoutes          = require("../routes/auth.Routes");
const adminRoutes         = require("../routes/admin.Routes");
const branchManagerRoutes = require("../routes/brance-manager.Routes");
const userRoutes          = require("../routes/user.Routes");
const auditRoutes         = require("../routes/audit.Routes");
const staffRoutes         = require("../routes/staff.Routes");
const { requestAuditLogger } = require("../middlewares/requestAuditLogger");
const { checkRequests }      = require("../middlewares/console.middleware");
const { SystemController }   = require("../controllers/system.controllers");

// ─── Express app ──────────────────────────────────────────────────────────────
const app = express();

app.use(cors({ origin: "*", credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(requestAuditLogger);
app.use(checkRequests);

// Health
app.get("/api/system/health", SystemController.healthCheck);
app.get("/api/system/ready",  SystemController.systemReady);

// API
app.use("/api/auth",           authRoutes);
app.use("/api/admin",          adminRoutes);
app.use("/api/branch-manager", branchManagerRoutes);
app.use("/api/staff",          staffRoutes);
app.use("/api/users",          userRoutes);
app.use("/api/audit",          auditRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found", path: req.originalUrl });
});

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[ERROR]", err.message);

  if (err.name === "ValidationError") {
    return res.status(400).json({ message: "Validation failed", details: err.errors });
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || "field";
    return res.status(409).json({ message: `${field} already exists` });
  }
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({ message: "Invalid token" });
  }
  if (err.name === "TokenExpiredError") {
    return res.status(401).json({ message: "Token expired" });
  }
  if (err.name === "CastError") {
    return res.status(400).json({ message: `Invalid ${err.path}` });
  }

  res.status(err.statusCode || 500).json({
    message: err.message || "Internal server error",
  });
});

// ─── MongoDB connection (cached for Vercel warm invocations) ──────────────────
let conn = null;

async function connectDB() {
  if (conn && mongoose.connection.readyState === 1) return conn;

  conn = await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS:          45000,
    maxPoolSize:              5,
    minPoolSize:              1,
    // IMPORTANT: do NOT set bufferCommands: false — it causes buffering timeout errors
  });

  console.log("✅ MongoDB connected:", mongoose.connection.host);
  return conn;
}

// ─── Export: Vercel calls this as a serverless function ───────────────────────
module.exports = async (req, res) => {
  // CORS preflight
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,Accept");

  if (req.method === "OPTIONS") return res.status(204).end();

  // Connect DB before every request (cached — near-instant on warm instances)
  try {
    await connectDB();
  } catch (err) {
    console.error("❌ MongoDB:", err.message);
    return res.status(503).json({
      message: "Database unavailable. Please try again.",
      code: "DB_ERROR",
    });
  }

  return app(req, res);
};
