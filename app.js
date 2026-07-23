"use strict";

const express = require("express");
const cors    = require("cors");

const authRoutes          = require("./routes/auth.Routes");
const adminRoutes         = require("./routes/admin.Routes");
const branchManagerRoutes = require("./routes/branch-manager.Routes");
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

module.exports = app;
