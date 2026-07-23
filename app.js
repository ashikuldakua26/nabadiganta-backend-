"use strict";

// ─── Env injection — load .env first (Vercel injects these automatically) ────
try { require("dotenv").config(); } catch (_) {}

if (!process.env.MONGODB_URI) {
  process.env.MONGODB_URI = "mongodb+srv://pwa_control:iucnr75i0ZYqv9xs@pwa0.6uuafq9.mongodb.net/nabadiganta";
}
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "nabadiganta_ngo_jwt_secret_2024_secure_key";
}
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "production";
}

const express = require("express");
const cors    = require("cors");
const mongoose = require("mongoose");

const authRoutes          = require("./routes/auth.Routes");
const adminRoutes         = require("./routes/admin.Routes");
const branchManagerRoutes = require("./routes/brance-manager.Routes");
const userRoutes          = require("./routes/user.Routes");
const auditRoutes         = require("./routes/audit.Routes");
const staffRoutes         = require("./routes/staff.Routes");

const { requestAuditLogger } = require("./middlewares/requestAuditLogger");
const { checkRequests }      = require("./middlewares/console.middleware");
const { SystemController }   = require("./controllers/system.controllers");
const { sanitizeRequest }    = require("./utils/validators");
const { requestLogger }      = require("./utils/logger");
const { requestId }          = require("./utils/response");

const app = express();

// ─── Core middleware ──────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestId);
app.use(sanitizeRequest);
app.use(requestLogger);
app.use(requestAuditLogger);
app.use(checkRequests);

// ─── System / health ─────────────────────────────────────────────────────────
app.get("/api/system/health", SystemController.healthCheck);
app.get("/api/system/ready",  SystemController.systemReady);

// ─── API routes ───────────────────────────────────────────────────────────────
app.use("/api/auth",            authRoutes);
app.use("/api/admin",           adminRoutes);
app.use("/api/branch-manager",  branchManagerRoutes);
app.use("/api/staff",           staffRoutes);
app.use("/api/users",           userRoutes);
app.use("/api/audit",           auditRoutes);

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Route not found: ${req.method} ${req.originalUrl}`,
      code: "NOT_FOUND",
      statusCode: 404,
      timestamp: new Date().toISOString(),
    },
  });
});

// ─── Global error handler ─────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[ERROR]", err.message);

  if (err.name === "ValidationError" && err.errors) {
    const details = {};
    Object.keys(err.errors).forEach((k) => { details[k] = err.errors[k].message; });
    return res.status(400).json({
      success: false, error: { message: "Validation failed", code: "VALIDATION_ERROR", statusCode: 400, details, timestamp: new Date().toISOString() },
    });
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || "field";
    return res.status(409).json({
      success: false, error: { message: `${field} already exists`, code: "DUPLICATE_KEY", statusCode: 409, timestamp: new Date().toISOString() },
    });
  }
  if (err.name === "CastError") {
    return res.status(400).json({
      success: false, error: { message: `Invalid ${err.path}`, code: "INVALID_ID", statusCode: 400, timestamp: new Date().toISOString() },
    });
  }
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      success: false, error: { message: "Invalid token", code: "INVALID_TOKEN", statusCode: 401, timestamp: new Date().toISOString() },
    });
  }
  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      success: false, error: { message: "Token expired", code: "TOKEN_EXPIRED", statusCode: 401, timestamp: new Date().toISOString() },
    });
  }

  const status = err.statusCode || 500;
  res.status(status).json({
    success: false,
    error: {
      message: process.env.NODE_ENV === "development" ? err.message : "Internal server error",
      code: err.code || "INTERNAL_ERROR",
      statusCode: status,
      timestamp: new Date().toISOString(),
    },
  });
});

// ─── Vercel serverless handler — connect DB on each request ───────────────────
let _connectPromise = null;
function connectDB() {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (_connectPromise) return _connectPromise;
  _connectPromise = mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    maxPoolSize: 5,
    minPoolSize: 1,
  }).then((conn) => { _connectPromise = null; return conn; })
    .catch((err) => { _connectPromise = null; throw err; });
  return _connectPromise;
}

// Export for Vercel serverless
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,Accept,X-Requested-With");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  try { await connectDB(); }
  catch (err) { console.error("DB error:", err.message); res.status(503).json({ message: "Database unavailable", code: "DB_CONNECTION_ERROR" }); return; }
  app(req, res);
};

// For local dev: also listen on a port when run directly
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  connectDB().then(() => {
    app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Server running → http://0.0.0.0:${PORT}`));
  }).catch((err) => { console.error("❌ MongoDB failed:", err.message); process.exit(1); });
}
