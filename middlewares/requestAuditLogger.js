const AuditLog = require("../models/AuditLog");
const isTestEnvironment = process.env.NODE_ENV === "test" || process.env.DISABLE_AUDIT_LOGGING === "true";

function sanitizeBody(body) {
  if (!body || typeof body !== "object") return "";

  const clone = { ...body };
  const sensitiveKeys = ["pin", "currentPin", "newPin", "password", "token"];
  sensitiveKeys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(clone, key)) {
      clone[key] = "***";
    }
  });

  const asString = JSON.stringify(clone);
  if (asString.length > 500) {
    return `${asString.slice(0, 500)}...`;
  }

  return asString;
}

function requestAuditLogger(req, res, next) {
  if (isTestEnvironment) return next();

  const start = Date.now();

  res.on("finish", () => {
    if (req.path.startsWith("/api/system/health") || req.path.startsWith("/api/system/ready")) {
      return;
    }

    AuditLog.create({
      method: req.method,
      path: req.originalUrl || req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - start,
      ip: req.ip || "",
      userAgent: req.get("user-agent") || "",
      performedBy: req.user?.id || null,
      role: req.user?.role || "guest",
      requestBody: sanitizeBody(req.body),
    }).catch(() => null);
  });

  return next();
}

module.exports = {
  requestAuditLogger,
};
