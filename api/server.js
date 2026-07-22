const express = require("express");
const cors    = require("cors");

const authRoutes          = require("../routes/auth.Routes");
const adminRoutes         = require("../routes/admin.Routes");
const branchManagerRoutes = require("../routes/brance-manager.Routes");
const userRoutes          = require("../routes/user.Routes");
const auditRoutes         = require("../routes/audit.Routes");
const staffRoutes         = require("../routes/staff.Routes");
const { requestAuditLogger } = require("../middlewares/requestAuditLogger");
const { checkRequests }      = require("../middlewares/console.middleware");
const { SystemController }   = require("../controllers/system.controllers");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestAuditLogger);
app.use(checkRequests);

app.get("/api/system/health", SystemController.healthCheck);
app.get("/api/system/ready",  SystemController.systemReady);

app.use("/api/auth",           authRoutes);
app.use("/api/admin",          adminRoutes);
app.use("/api/branch-manager", branchManagerRoutes);
app.use("/api/staff",          staffRoutes);
app.use("/api/users",          userRoutes);
app.use("/api/audit",          auditRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error("[ERROR]", err.message);
  res.status(err.statusCode || 500).json({ message: err.message || "Internal server error" });
});

module.exports = app;
