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

const app = express();

// ─── CORS — allow all origins (mobile app on any IP/domain) ──────────────────
app.use(cors({
  origin:  "*",
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization","Accept"],
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(requestAuditLogger);
app.use(checkRequests);

// ─── Health & Root ────────────────────────────────────────────────────────────
app.get("/", (_, res) => {
  res.json({
    service:     "নব্য দিগন্ত এন জিও — NGO Management API",
    version:     "1.2.0",
    status:      "online",
    environment: process.env.NODE_ENV || "development",
    docs: {
      health:       "GET  /api/system/health",
      ready:        "GET  /api/system/ready",
      login:        "POST /api/auth/login",
      branches:     "GET  /api/admin/branches",
      users:        "GET  /api/admin/users",
      transactions: "GET  /api/admin/transactions",
      customers:    "GET  /api/branch-manager/customers",
      staff:        "GET  /api/staff/dashboard",
      audit:        "GET  /api/audit/statistics",
    },
  });
});
app.get("/api/system/health", SystemController.healthCheck);
app.get("/api/system/ready",  SystemController.systemReady);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/auth",           authRoutes);
app.use("/api/admin",          adminRoutes);
app.use("/api/branch-manager", branchManagerRoutes);
app.use("/api/staff",          staffRoutes);
app.use("/api/users",          userRoutes);
app.use("/api/audit",          auditRoutes);

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: "Route not found", path: req.originalUrl });
});

// ─── Error handler ────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[ERR]", err.message);

  if (err.name === "ValidationError")  return res.status(400).json({ message: "Validation failed", details: err.errors });
  if (err.code  === 11000)             return res.status(409).json({ message: `${Object.keys(err.keyPattern||{})[0]||"field"} already exists` });
  if (err.name === "JsonWebTokenError")return res.status(401).json({ message: "Invalid token" });
  if (err.name === "TokenExpiredError")return res.status(401).json({ message: "Token expired" });
  if (err.name === "CastError")        return res.status(400).json({ message: `Invalid ${err.path}` });

  res.status(err.statusCode || 500).json({ message: err.message || "Internal server error" });
});

module.exports = app;
