const AuditLog = require("../models/AuditLog");
const isTestEnvironment = process.env.NODE_ENV === "test" || process.env.DISABLE_AUDIT_LOGGING === "true";

/**
 * Log an audit event
 * @param {Object} options - Audit log options
 * @param {string} options.action - Action type (LOGIN, LOGOUT, CREATE, UPDATE, DELETE, etc.)
 * @param {string} options.module - Module name (User, Customer, Transaction, etc.)
 * @param {string} options.description - Human-readable description
 * @param {Object} options.req - Express request object (for IP, user agent, etc.)
 * @param {Object} options.user - User performing the action
 * @param {mongoose.Types.ObjectId} options.resourceId - ID of affected resource
 * @param {mongoose.Types.ObjectId} options.relatedResourceId - ID of related resource
 * @param {Object} options.beforeData - Data before the action
 * @param {Object} options.afterData - Data after the action
 * @param {number} options.statusCode - HTTP status code
 * @param {number} options.durationMs - Request duration
 * @param {boolean} options.success - Whether action succeeded
 * @param {string} options.errorMessage - Error message if failed
 * @param {Object} options.metadata - Additional metadata
 * @returns {Promise<Object>} Created audit log
 */
async function logAudit(options = {}) {
  if (isTestEnvironment) {
    return null;
  }

  try {
    const {
      action,
      module,
      description = "",
      req = {},
      user = null,
      resourceId = null,
      relatedResourceId = null,
      beforeData = null,
      afterData = null,
      statusCode = 200,
      durationMs = 0,
      success = true,
      errorMessage = "",
      metadata = null,
    } = options;

    if (!action || !module) {
      console.warn("logAudit: action and module are required");
      return null;
    }

    // Extract enhanced device and location info
    const userAgent = req.get?.("user-agent") || req.headers?.["user-agent"] || "";
    const deviceInfo = parseDeviceInfo(userAgent);
    const locationInfo = parseLocationInfo(req);
    const changes = beforeData && afterData ? buildChangesLog(beforeData, afterData) : [];

    const auditLog = await AuditLog.create({
      action,
      module,
      description,
      method: req.method || "",
      path: req.path || req.originalUrl || "",
      ip: req.ip || req.connection?.remoteAddress || "",
      userAgent,
      performedBy: user?._id || user?.id || null,
      role: user?.role || "guest",
      resourceId,
      relatedResourceId,
      beforeData: sanitizeData(beforeData),
      afterData: sanitizeData(afterData),
      requestBody: sanitizeRequestBody(req.body),
      statusCode,
      durationMs,
      success,
      errorMessage,
      metadata,
      // Device info (NEW)
      deviceType: deviceInfo.deviceType,
      deviceBrand: deviceInfo.deviceBrand,
      deviceModel: deviceInfo.deviceModel,
      osType: deviceInfo.osType,
      osVersion: deviceInfo.osVersion,
      browserName: deviceInfo.browserName,
      browserVersion: deviceInfo.browserVersion,
      // Location info (NEW)
      location: locationInfo,
      // Changes log (NEW)
      changes,
    });

    return auditLog;
  } catch (error) {
    console.error("Error logging audit:", error.message);
    return null;
  }
}

/**
 * Log a login event
 * @param {Object} user - User object
 * @param {Object} req - Express request object
 * @param {boolean} success - Whether login succeeded
 * @param {string} errorMessage - Error message if failed
 * @returns {Promise<Object>}
 */
async function logLogin(user, req, success = true, errorMessage = "") {
  return logAudit({
    action: "LOGIN",
    module: "AUTH",
    description: success ? `User ${user?.name} (${user?.phone}) logged in` : `Failed login attempt`,
    req,
    user: success ? user : null,
    resourceId: user?._id,
    statusCode: success ? 200 : 401,
    success,
    errorMessage,
    metadata: {
      phone: user?.phone,
      role: user?.role,
    },
  });
}

/**
 * Log a logout event
 * @param {Object} user - User object
 * @param {Object} req - Express request object
 * @returns {Promise<Object>}
 */
async function logLogout(user, req) {
  return logAudit({
    action: "LOGOUT",
    module: "AUTH",
    description: `User ${user?.name} (${user?.phone}) logged out`,
    req,
    user,
    resourceId: user?._id,
    statusCode: 200,
    success: true,
  });
}

/**
 * Log a create event
 * @param {Object} options
 * @param {string} options.module - Module name
 * @param {Object} options.data - Created data
 * @param {Object} options.user - User who created
 * @param {Object} options.req - Express request
 * @returns {Promise<Object>}
 */
async function logCreate(options = {}) {
  const { module, data, user, req } = options;
  
  return logAudit({
    action: "CREATE",
    module,
    description: `New ${module} created`,
    req,
    user,
    resourceId: data?._id,
    afterData: sanitizeData(data),
    statusCode: 201,
    success: true,
  });
}

/**
 * Log an update event
 * @param {Object} options
 * @param {string} options.module - Module name
 * @param {Object} options.beforeData - Data before update
 * @param {Object} options.afterData - Data after update
 * @param {Object} options.user - User who updated
 * @param {Object} options.req - Express request
 * @returns {Promise<Object>}
 */
async function logUpdate(options = {}) {
  const { module, beforeData, afterData, user, req } = options;
  
  const changes = getDataChanges(beforeData, afterData);
  
  return logAudit({
    action: "UPDATE",
    module,
    description: `${module} updated: ${Object.keys(changes).join(", ")}`,
    req,
    user,
    resourceId: afterData?._id,
    beforeData: sanitizeData(beforeData),
    afterData: sanitizeData(afterData),
    statusCode: 200,
    success: true,
    metadata: {
      changedFields: Object.keys(changes),
    },
  });
}

/**
 * Log a delete event
 * @param {Object} options
 * @param {string} options.module - Module name
 * @param {Object} options.data - Deleted data
 * @param {Object} options.user - User who deleted
 * @param {Object} options.req - Express request
 * @returns {Promise<Object>}
 */
async function logDelete(options = {}) {
  const { module, data, user, req } = options;
  
  return logAudit({
    action: "DELETE",
    module,
    description: `${module} deleted`,
    req,
    user,
    resourceId: data?._id,
    beforeData: sanitizeData(data),
    statusCode: 200,
    success: true,
  });
}

/**
 * Get audit logs for a user
 * @param {string} userId - User ID
 * @param {number} limit - Number of logs to return
 * @param {number} skip - Number of logs to skip
 * @returns {Promise<Array>}
 */
async function getUserAuditLogs(userId, limit = 50, skip = 0) {
  try {
    return await AuditLog.find({ performedBy: userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .populate("performedBy", "name phone role");
  } catch (error) {
    console.error("Error fetching user audit logs:", error.message);
    return [];
  }
}

/**
 * Get audit logs for a resource
 * @param {string} resourceId - Resource ID
 * @param {number} limit - Number of logs to return
 * @param {number} skip - Number of logs to skip
 * @returns {Promise<Array>}
 */
async function getResourceAuditLogs(resourceId, limit = 50, skip = 0) {
  try {
    return await AuditLog.find({
      $or: [{ resourceId }, { relatedResourceId: resourceId }],
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .populate("performedBy", "name phone role");
  } catch (error) {
    console.error("Error fetching resource audit logs:", error.message);
    return [];
  }
}

/**
 * Build query object for audit log filters
 * @param {Object} queryParams
 * @returns {Object}
 */
function buildAuditQuery(queryParams = {}) {
  const query = {};

  if (queryParams.action) {
    query.action = String(queryParams.action).toUpperCase();
  }

  if (queryParams.module) {
    query.module = String(queryParams.module);
  }

  if (queryParams.performedBy || queryParams.userId) {
    query.performedBy = queryParams.performedBy || queryParams.userId;
  }

  if (queryParams.resourceId) {
    query.resourceId = queryParams.resourceId;
  }

  if (queryParams.relatedResourceId) {
    query.relatedResourceId = queryParams.relatedResourceId;
  }

  if (queryParams.deviceType) {
    query.deviceType = String(queryParams.deviceType).toLowerCase();
  }

  if (queryParams.osType) {
    query.osType = String(queryParams.osType);
  }

  if (queryParams.browserName) {
    query.browserName = String(queryParams.browserName);
  }

  if (queryParams.browserVersion) {
    query.browserVersion = String(queryParams.browserVersion);
  }

  if (queryParams.country) {
    query["location.country"] = String(queryParams.country);
  }

  if (queryParams.success !== undefined) {
    query.success = queryParams.success === "true" || queryParams.success === "1" || queryParams.success === true;
  }

  if (queryParams.changedField) {
    query["changes.field"] = String(queryParams.changedField);
  }

  if (queryParams.startDate || queryParams.endDate) {
    query.createdAt = {};
    if (queryParams.startDate) {
      const startDate = new Date(queryParams.startDate);
      if (!Number.isNaN(startDate.getTime())) {
        query.createdAt.$gte = startDate;
      }
    }
    if (queryParams.endDate) {
      const endDate = new Date(queryParams.endDate);
      if (!Number.isNaN(endDate.getTime())) {
        query.createdAt.$lte = endDate;
      }
    }

    if (Object.keys(query.createdAt).length === 0) {
      delete query.createdAt;
    }
  }

  return query;
}

/**
 * Get all audit logs with filters
 * @param {Object} filters - Filter options
 * @param {string} filters.action - Action type
 * @param {string} filters.module - Module name
 * @param {number} filters.limit - Number of logs to return
 * @param {number} filters.skip - Number of logs to skip
 * @returns {Promise<Array>}
 */
async function getAuditLogs(filters = {}) {
  try {
    const { limit = 100, skip = 0 } = filters;
    const query = buildAuditQuery(filters);

    return await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .populate("performedBy", "name phone role");
  } catch (error) {
    console.error("Error fetching audit logs:", error.message);
    return [];
  }
}

/**
 * Sanitize request body by removing sensitive fields
 * @param {Object} body - Request body
 * @returns {string}
 */
function sanitizeRequestBody(body = {}) {
  if (!body) return "";
  
  const sanitized = { ...body };
  const sensitiveFields = ["pin", "password", "token", "secret"];
  
  sensitiveFields.forEach((field) => {
    if (sanitized[field]) {
      sanitized[field] = "***REDACTED***";
    }
  });
  
  return JSON.stringify(sanitized);
}

/**
 * Sanitize data by removing sensitive fields
 * @param {Object} data - Data to sanitize
 * @returns {Object}
 */
function sanitizeData(data = {}) {
  if (!data || typeof data !== "object") return data;
  
  const sanitized = data.toObject ? data.toObject() : { ...data };
  const sensitiveFields = ["pin", "password", "token", "secret", "pin_hash"];
  
  sensitiveFields.forEach((field) => {
    if (sanitized[field]) {
      sanitized[field] = "***REDACTED***";
    }
  });
  
  return sanitized;
}

/**
 * Extract device information from user agent
 * @param {string} userAgent - User agent string
 * @returns {Object} Device info
 */
function parseDeviceInfo(userAgent = "") {
  const result = {
    deviceType: "unknown",
    deviceBrand: "",
    deviceModel: "",
    osType: "unknown",
    osVersion: "",
    browserName: "",
    browserVersion: "",
  };

  if (!userAgent) return result;

  const ua = userAgent.toLowerCase();

  // Detect device type
  if (/mobile|android|iphone|ipod|blackberry|windows phone/.test(ua)) {
    result.deviceType = "mobile";
  } else if (/ipad|tablet|kindle/.test(ua)) {
    result.deviceType = "tablet";
  } else if (/windows|macintosh|linux|x11/.test(ua)) {
    result.deviceType = "desktop";
  }

  // Detect OS and version
  if (/windows nt/.test(ua)) {
    result.osType = "Windows";
    const versionMatch = ua.match(/windows nt ([\d.]+)/);
    if (versionMatch) {
      const versionMap = {
        "10.0": "10",
        "6.3": "8.1",
        "6.2": "8",
        "6.1": "7",
        "6.0": "Vista",
      };
      result.osVersion = versionMap[versionMatch[1]] || versionMatch[1];
    }
  } else if (/macintosh/.test(ua)) {
    result.osType = "macOS";
    const versionMatch = ua.match(/mac os x ([\d_.]+)/);
    if (versionMatch) {
      result.osVersion = versionMatch[1].replace(/_/g, ".");
    }
  } else if (/android/.test(ua)) {
    result.osType = "Android";
    const versionMatch = ua.match(/android ([\d.]+)/);
    if (versionMatch) {
      result.osVersion = versionMatch[1];
    }
  } else if (/iphone|ipad|ipod/.test(ua)) {
    result.osType = "iOS";
    const versionMatch = ua.match(/os ([\d_]+)/);
    if (versionMatch) {
      result.osVersion = versionMatch[1].replace(/_/g, ".");
    }
  } else if (/linux/.test(ua)) {
    result.osType = "Linux";
  }

  // Detect browser
  if (/chrome|chromium|crios/.test(ua)) {
    result.browserName = "Chrome";
    const versionMatch = ua.match(/chrome\/([\d.]+)|crios\/([\d.]+)/);
    if (versionMatch) {
      result.browserVersion = versionMatch[1] || versionMatch[2];
    }
  } else if (/safari/.test(ua) && !/chrome/.test(ua)) {
    result.browserName = "Safari";
    const versionMatch = ua.match(/version\/([\d.]+)/);
    if (versionMatch) {
      result.browserVersion = versionMatch[1];
    }
  } else if (/firefox/.test(ua)) {
    result.browserName = "Firefox";
    const versionMatch = ua.match(/firefox\/([\d.]+)/);
    if (versionMatch) {
      result.browserVersion = versionMatch[1];
    }
  } else if (/edge/.test(ua)) {
    result.browserName = "Edge";
    const versionMatch = ua.match(/edge\/([\d.]+)/);
    if (versionMatch) {
      result.browserVersion = versionMatch[1];
    }
  }

  // Detect device brand and model
  if (/iphone|ipad|ipod/.test(ua)) {
    result.deviceBrand = "Apple";
    if (/iphone/.test(ua)) {
      result.deviceModel = "iPhone";
    } else if (/ipad/.test(ua)) {
      result.deviceModel = "iPad";
    }
  } else if (/android/.test(ua)) {
    const brandMatch = ua.match(/android.*?([a-z0-9]+)/i);
    if (brandMatch) {
      result.deviceBrand = brandMatch[1];
    }
  }

  return result;
}

/**
 * Build detailed changes array
 * @param {Object} before - Before data
 * @param {Object} after - After data
 * @returns {Array} Changes array
 */
function buildChangesLog(before = {}, after = {}) {
  const beforeObj = before.toObject ? before.toObject() : before;
  const afterObj = after.toObject ? after.toObject() : after;
  const changes = [];

  const allKeys = new Set([
    ...Object.keys(beforeObj || {}),
    ...Object.keys(afterObj || {}),
  ]);

  allKeys.forEach((field) => {
    const oldValue = beforeObj?.[field];
    const newValue = afterObj?.[field];

    const oldStr = JSON.stringify(oldValue);
    const newStr = JSON.stringify(newValue);

    // Skip if values are the same
    if (oldStr === newStr) return;

    // Determine change type
    let changeType = "modified";
    if (oldValue === undefined || oldValue === null) {
      changeType = "added";
    } else if (newValue === undefined || newValue === null) {
      changeType = "deleted";
    }

    changes.push({
      field,
      oldValue,
      newValue,
      changeType,
    });
  });

  return changes;
}

/**
 * Parse location from coordinates or header
 * @param {Object} req - Express request object
 * @returns {Object} Location info
 */
function parseLocationInfo(req = {}) {
  const location = {
    latitude: null,
    longitude: null,
    address: "",
    city: "",
    country: "",
  };

  // Try to get location from request headers (from client)
  const lat = req.headers["x-client-latitude"] || req.query?.lat;
  const lon = req.headers["x-client-longitude"] || req.query?.lon;

  if (lat && lon) {
    location.latitude = parseFloat(lat);
    location.longitude = parseFloat(lon);
  }

  // Get location from custom headers if provided
  if (req.headers["x-client-location"]) {
    location.address = req.headers["x-client-location"];
  }

  if (req.headers["x-client-city"]) {
    location.city = req.headers["x-client-city"];
  }

  if (req.headers["x-client-country"]) {
    location.country = req.headers["x-client-country"];
  }

  return location;
}

/**
 * Get changed fields between two objects
 * @param {Object} before - Before object
 * @param {Object} after - After object
 * @returns {Object} Changed fields
 */
function getDataChanges(before = {}, after = {}) {
  const beforeObj = before.toObject ? before.toObject() : before;
  const afterObj = after.toObject ? after.toObject() : after;
  const changes = {};
  
  const allKeys = new Set([
    ...Object.keys(beforeObj || {}),
    ...Object.keys(afterObj || {}),
  ]);
  
  allKeys.forEach((key) => {
    const beforeVal = beforeObj?.[key];
    const afterVal = afterObj?.[key];
    
    if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
      changes[key] = { before: beforeVal, after: afterVal };
    }
  });
  
  return changes;
}

module.exports = {
  logAudit,
  logLogin,
  logLogout,
  logCreate,
  logUpdate,
  logDelete,
  getUserAuditLogs,
  getResourceAuditLogs,
  getAuditLogs,
  sanitizeRequestBody,
  sanitizeData,
  getDataChanges,
  parseDeviceInfo,
  buildChangesLog,
  parseLocationInfo,
};
