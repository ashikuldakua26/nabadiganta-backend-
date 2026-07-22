const AuditLog = require("../models/AuditLog");
const { getUserAuditLogs, getResourceAuditLogs, getAuditLogs } = require("../helpers/audit");

/**
 * Get my audit logs (current user)
 */
async function getMyAuditLogs(req, res) {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;

    const logs = await getUserAuditLogs(req.user.id, limit, skip);
    const total = await AuditLog.countDocuments({ performedBy: req.user.id });

    return res.json({
      data: logs,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

/**
 * Get audit logs for a specific resource
 */
async function getResourceAuditLogsController(req, res) {
  try {
    const { resourceId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;

    const logs = await getResourceAuditLogs(resourceId, limit, skip);
    const total = await AuditLog.countDocuments({
      $or: [{ resourceId }, { relatedResourceId: resourceId }],
    });

    return res.json({
      data: logs,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
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
    query.success = queryParams.success === "true" || queryParams.success === "1";
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
 * Get all audit logs (admin only)
 */
async function getAllAuditLogs(req, res) {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;
    const filters = { ...req.query };

    const logs = await getAuditLogs({ ...filters, limit, skip });
    const query = buildAuditQuery(filters);
    const total = await AuditLog.countDocuments(query);

    return res.json({
      data: logs,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

/**
 * Get login history
 */
async function getLoginHistory(req, res) {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;
    const query = { action: "LOGIN" };

    if (req.query.success !== undefined) {
      query.success = req.query.success === "true" || req.query.success === "1";
    }

    if (req.query.deviceType) {
      query.deviceType = String(req.query.deviceType).toLowerCase();
    }

    if (req.query.country) {
      query["location.country"] = String(req.query.country);
    }

    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .populate("performedBy", "name phone role");

    const total = await AuditLog.countDocuments(query);

    return res.json({
      data: logs,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

/**
 * Get failed login attempts
 */
async function getFailedLogins(req, res) {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;
    const query = {
      action: "LOGIN",
      success: false,
    };

    if (req.query.deviceType) {
      query.deviceType = String(req.query.deviceType).toLowerCase();
    }

    if (req.query.country) {
      query["location.country"] = String(req.query.country);
    }

    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .populate("performedBy", "name phone role");

    const total = await AuditLog.countDocuments(query);

    return res.json({
      data: logs,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

/**
 * Get change history for a user
 */
async function getUserChangeHistory(req, res) {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;

    const logs = await AuditLog.find({
      performedBy: userId,
      action: { $in: ["CREATE", "UPDATE", "DELETE"] },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);

    const total = await AuditLog.countDocuments({
      performedBy: userId,
      action: { $in: ["CREATE", "UPDATE", "DELETE"] },
    });

    return res.json({
      data: logs,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

/**
 * Get audit statistics
 */
async function getAuditStatistics(req, res) {
  try {
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const stats = {
      logins24h: await AuditLog.countDocuments({
        action: "LOGIN",
        success: true,
        createdAt: { $gte: last24Hours },
      }),
      failedLogins24h: await AuditLog.countDocuments({
        action: "LOGIN",
        success: false,
        createdAt: { $gte: last24Hours },
      }),
      logins7d: await AuditLog.countDocuments({
        action: "LOGIN",
        success: true,
        createdAt: { $gte: last7Days },
      }),
      changes24h: await AuditLog.countDocuments({
        action: { $in: ["CREATE", "UPDATE", "DELETE"] },
        createdAt: { $gte: last24Hours },
      }),
      changes7d: await AuditLog.countDocuments({
        action: { $in: ["CREATE", "UPDATE", "DELETE"] },
        createdAt: { $gte: last7Days },
      }),
      actionBreakdown: await AuditLog.aggregate([
        {
          $group: {
            _id: "$action",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]),
      moduleBreakdown: await AuditLog.aggregate([
        {
          $group: {
            _id: "$module",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]),
    };

    // Summary totals for the mobile stats bar
    const total   = await AuditLog.countDocuments({});
    const logins  = await AuditLog.countDocuments({ action: "LOGIN", success: true });
    const creates = await AuditLog.countDocuments({ action: "CREATE" });
    const errors  = await AuditLog.countDocuments({ success: false });

    return res.json({
      success: true,
      stats:   { total, logins, creates, errors },
      detail:  stats,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  getMyAuditLogs,
  getResourceAuditLogsController,
  getAllAuditLogs,
  getLoginHistory,
  getFailedLogins,
  getUserChangeHistory,
  getAuditStatistics,
};
