/**
 * Professional Response Standardization System
 * Consistent API response format across all endpoints
 * Version: 1.0.0
 */

/**
 * Success response format
 */
class SuccessResponse {
  constructor(data, message = 'Success', metadata = {}) {
    this.success = true;
    this.message = message;
    this.data = data;
    this.metadata = {
      timestamp: new Date().toISOString(),
      ...metadata,
    };
  }

  send(res, statusCode = 200) {
    return res.status(statusCode).json(this);
  }
}

/**
 * Paginated response format
 */
class PaginatedResponse extends SuccessResponse {
  constructor(data, pagination, message = 'Success') {
    super(data, message, {
      pagination: {
        currentPage: pagination.page,
        pageSize: pagination.limit,
        totalItems: pagination.total,
        totalPages: Math.ceil(pagination.total / pagination.limit),
        hasNextPage: pagination.page < Math.ceil(pagination.total / pagination.limit),
        hasPrevPage: pagination.page > 1,
      },
    });
  }
}

/**
 * Created response (201)
 */
class CreatedResponse extends SuccessResponse {
  constructor(data, message = 'Resource created successfully') {
    super(data, message);
  }

  send(res) {
    return super.send(res, 201);
  }
}

/**
 * No content response (204)
 */
class NoContentResponse {
  send(res) {
    return res.status(204).send();
  }
}

/**
 * Helper functions
 */

/**
 * Send success response
 */
const sendSuccess = (res, data, message = 'Success', statusCode = 200) => {
  return new SuccessResponse(data, message).send(res, statusCode);
};

/**
 * Send created response
 */
const sendCreated = (res, data, message = 'Resource created successfully') => {
  return new CreatedResponse(data, message).send(res);
};

/**
 * Send paginated response
 */
const sendPaginated = (res, data, pagination, message = 'Success') => {
  return new PaginatedResponse(data, pagination, message).send(res);
};

/**
 * Send no content response
 */
const sendNoContent = (res) => {
  return new NoContentResponse().send(res);
};

/**
 * Send updated response
 */
const sendUpdated = (res, data, message = 'Resource updated successfully') => {
  return sendSuccess(res, data, message, 200);
};

/**
 * Send deleted response
 */
const sendDeleted = (res, message = 'Resource deleted successfully') => {
  return sendSuccess(res, null, message, 200);
};

/**
 * API versioning middleware
 */
const apiVersion = (version) => {
  return (req, res, next) => {
    req.apiVersion = version;
    res.setHeader('X-API-Version', version);
    next();
  };
};

/**
 * Response time middleware
 */
const responseTime = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    res.setHeader('X-Response-Time', `${duration}ms`);
  });
  
  next();
};

/**
 * Add metadata to response
 */
const addMetadata = (req) => {
  return {
    requestId: req.id || generateRequestId(),
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
  };
};

/**
 * Generate unique request ID
 */
const generateRequestId = () => {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Request ID middleware
 */
const requestId = (req, res, next) => {
  req.id = generateRequestId();
  res.setHeader('X-Request-Id', req.id);
  next();
};

module.exports = {
  SuccessResponse,
  PaginatedResponse,
  CreatedResponse,
  NoContentResponse,
  sendSuccess,
  sendCreated,
  sendPaginated,
  sendNoContent,
  sendUpdated,
  sendDeleted,
  apiVersion,
  responseTime,
  addMetadata,
  requestId,
};
