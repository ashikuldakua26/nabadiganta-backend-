const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    // Event type: API_CALL, LOGIN, LOGOUT, CREATE, UPDATE, DELETE, etc.
    action: { type: String, required: true, index: true, uppercase: true },
    
    // Resource being acted upon: User, Customer, Transaction, etc.
    module: { type: String, required: true, index: true },
    
    // Description of what happened
    description: { type: String, default: "" },
    
    // HTTP Method (GET, POST, PUT, DELETE)
    method: { type: String, default: "" },
    
    // API endpoint path
    path: { type: String, default: "" },
    
    // HTTP status code
    statusCode: { type: Number, default: null },
    
    // Request duration in milliseconds
    durationMs: { type: Number, default: 0 },
    
    // Client IP address
    ip: { type: String, default: "" },
    
    // User agent string
    userAgent: { type: String, default: "" },
    
    // User who performed the action
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    
    // User role
    role: { type: String, default: "guest", index: true },
    
    // Affected resource ID
    resourceId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    
    // Related resource ID (e.g., customer for a transaction)
    relatedResourceId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    
    // Before state (for updates)
    beforeData: { type: mongoose.Schema.Types.Mixed, default: null },
    
    // After state (for updates)
    afterData: { type: mongoose.Schema.Types.Mixed, default: null },
    
    // Request body (sanitized)
    requestBody: { type: String, default: "" },
    
    // Response status
    success: { type: Boolean, default: true, index: true },
    
    // Error message if failed
    errorMessage: { type: String, default: "" },
    
    // Additional metadata
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },

    // Device Information
    deviceType: { type: String, enum: ["mobile", "tablet", "desktop", "unknown"], default: "unknown" },
    deviceBrand: { type: String, default: "" },
    deviceModel: { type: String, default: "" },
    
    // OS Information
    osType: { type: String, enum: ["iOS", "Android", "Windows", "macOS", "Linux", "unknown"], default: "unknown" },
    osVersion: { type: String, default: "" },
    
    // Browser Information
    browserName: { type: String, default: "" },
    browserVersion: { type: String, default: "" },
    
    // Location Information
    location: {
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
      address: { type: String, default: "" },
      city: { type: String, default: "" },
      country: { type: String, default: "" },
    },

    // Change log - what fields changed
    changes: [
      {
        field: String,
        oldValue: mongoose.Schema.Types.Mixed,
        newValue: mongoose.Schema.Types.Mixed,
        changeType: { type: String, enum: ["added", "modified", "deleted"], default: "modified" },
      },
    ],
  },
  { timestamps: true }
);

// Indexes for performance
auditLogSchema.index({ performedBy: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, module: 1, createdAt: -1 });
auditLogSchema.index({ resourceId: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ deviceType: 1 });
auditLogSchema.index({ osType: 1 });
auditLogSchema.index({ "location.country": 1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
