"use strict";

const express = require("express");
const cors    = require("cors");

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
app.use(requestId);            // Add unique request ID
app.use(sanitizeRequest);      // Sanitize all inputs
app.use(requestLogger);        // Structured request logging
app.use(requestAuditLogger);   // Audit trail
app.use(checkRequests);        // Dev console logging

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
  const { NotFoundError } = require("./utils/errors");
  const error = new NotFoundError("Route", {
    path: req.originalUrl,
    method: req.method,
  });
  return res.status(404).json({
    success: false,
    error: {
      message: error.message,
      code: error.code,
      statusCode: 404,
      details: error.details,
      timestamp: error.timestamp,
    },
  });
});

// ─── Global error handler ─────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const { logger } = require("./utils/logger");

  logger.error("Unhandled error", err, {
    path: req.path,
    method: req.method,
    userId: req.user?.id,
    requestId: req.id,
  });

  // Professional error classes
  if (err.isOperational) {
    return res.status(err.statusCode).json(err.toJSON());
  }

  // Mongoose validation errors
  if (err.name === "ValidationError" && err.errors) {
    const details = {};
    Object.keys(err.errors).forEach((key) => {
      details[key] = err.errors[key].message;
    });
    return res.status(400).json({
      success: false,
      error: {
        message: "Validation failed",
        code: "VALIDATION_ERROR",
        statusCode: 400,
        details,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Mongoose cast errors (invalid ObjectId, etc.)
  if (err.name === "CastError") {
    return res.status(400).json({
      success: false,
      error: {
        message: `Invalid ${err.path}: ${err.value}`,
        code: "INVALID_ID",
        statusCode: 400,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || "field";
    return res.status(409).json({
      success: false,
      error: {
        message: `${field} already exists`,
        code: "DUPLICATE_KEY",
        statusCode: 409,
        details: { field },
        timestamp: new Date().toISOString(),
      },
    });
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      success: false,
      error: {
        message: "Invalid token",
        code: "INVALID_TOKEN",
        statusCode: 401,
        timestamp: new Date().toISOString(),
      },
    });
  }

  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      success: false,
      error: {
        message: "Token expired",
        code: "TOKEN_EXPIRED",
        statusCode: 401,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Unknown errors
  const status = err.statusCode || 500;
  const message =
    process.env.NODE_ENV === "development"
      ? err.message
      : "Internal server error";

  return res.status(status).json({
    success: false,
    error: {
      message,
      code: err.code || "INTERNAL_ERROR",
      statusCode: status,
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
      timestamp: new Date().toISOString(),
    },
  });
});

module.exports = app;
