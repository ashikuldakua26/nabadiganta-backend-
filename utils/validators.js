/**
 * Professional Validation System
 * Comprehensive validators for all data types
 * Version: 1.0.0
 */

const { ValidationError } = require('./errors');

/**
 * Phone number validator (Bangladesh format)
 */
const validatePhone = (phone) => {
  const phoneRegex = /^01[3-9]\d{8}$/;
  const cleanPhone = String(phone).replace(/\D/g, '');
  
  if (!phoneRegex.test(cleanPhone)) {
    throw new ValidationError('Invalid phone number format. Must be 11 digits starting with 01');
  }
  
  return cleanPhone;
};

/**
 * Email validator
 */
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!emailRegex.test(email)) {
    throw new ValidationError('Invalid email format');
  }
  
  return email.toLowerCase().trim();
};

/**
 * PIN validator
 */
const validatePin = (pin) => {
  const pinStr = String(pin).replace(/\D/g, '');
  
  if (pinStr.length !== 4) {
    throw new ValidationError('PIN must be exactly 4 digits');
  }
  
  return pinStr;
};

/**
 * Amount validator
 */
const validateAmount = (amount, field = 'Amount') => {
  const num = Number(amount);
  
  if (isNaN(num)) {
    throw new ValidationError(`${field} must be a valid number`);
  }
  
  if (num <= 0) {
    throw new ValidationError(`${field} must be greater than 0`);
  }
  
  if (num > 10000000) {
    throw new ValidationError(`${field} exceeds maximum allowed value`);
  }
  
  return num;
};

/**
 * Date validator
 */
const validateDate = (date, field = 'Date') => {
  const dateObj = new Date(date);
  
  if (isNaN(dateObj.getTime())) {
    throw new ValidationError(`${field} must be a valid date`);
  }
  
  return dateObj;
};

/**
 * Role validator
 */
const validateRole = (role) => {
  const validRoles = ['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'STAFF', 'USER'];
  
  if (!validRoles.includes(role)) {
    throw new ValidationError(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
  }
  
  return role;
};

/**
 * Transaction type validator
 */
const validateTransactionType = (type) => {
  const validTypes = ['deposit', 'loan', 'loan_payment', 'withdrawal', 'transfer'];
  
  if (!validTypes.includes(type)) {
    throw new ValidationError(`Invalid transaction type. Must be one of: ${validTypes.join(', ')}`);
  }
  
  return type;
};

/**
 * Status validator
 */
const validateStatus = (status, allowedStatuses) => {
  if (!allowedStatuses.includes(status)) {
    throw new ValidationError(`Invalid status. Must be one of: ${allowedStatuses.join(', ')}`);
  }
  
  return status;
};

/**
 * MongoDB ObjectId validator
 */
const validateObjectId = (id, field = 'ID') => {
  const objectIdRegex = /^[0-9a-fA-F]{24}$/;
  
  if (!objectIdRegex.test(id)) {
    throw new ValidationError(`Invalid ${field} format`);
  }
  
  return id;
};

/**
 * Required field validator
 */
const validateRequired = (value, field) => {
  if (value === undefined || value === null || value === '') {
    throw new ValidationError(`${field} is required`);
  }
  
  return value;
};

/**
 * String length validator
 */
const validateLength = (str, min, max, field) => {
  const length = String(str).length;
  
  if (length < min) {
    throw new ValidationError(`${field} must be at least ${min} characters`);
  }
  
  if (length > max) {
    throw new ValidationError(`${field} must not exceed ${max} characters`);
  }
  
  return str;
};

/**
 * Pagination parameters validator
 */
const validatePagination = (page, limit) => {
  const pageNum = parseInt(page) || 1;
  const limitNum = parseInt(limit) || 10;
  
  if (pageNum < 1) {
    throw new ValidationError('Page must be at least 1');
  }
  
  if (limitNum < 1 || limitNum > 100) {
    throw new ValidationError('Limit must be between 1 and 100');
  }
  
  return {
    page: pageNum,
    limit: limitNum,
    skip: (pageNum - 1) * limitNum,
  };
};

/**
 * Date range validator
 */
const validateDateRange = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (isNaN(start.getTime())) {
    throw new ValidationError('Invalid start date');
  }
  
  if (isNaN(end.getTime())) {
    throw new ValidationError('Invalid end date');
  }
  
  if (start > end) {
    throw new ValidationError('Start date must be before end date');
  }
  
  return { startDate: start, endDate: end };
};

/**
 * Validation middleware factory
 */
const validate = (schema) => {
  return (req, res, next) => {
    try {
      const errors = {};
      
      // Validate body
      if (schema.body) {
        Object.keys(schema.body).forEach((key) => {
          const validator = schema.body[key];
          try {
            if (validator.required && !req.body[key]) {
              errors[key] = `${key} is required`;
            } else if (req.body[key] && validator.validate) {
              req.body[key] = validator.validate(req.body[key]);
            }
          } catch (err) {
            errors[key] = err.message;
          }
        });
      }
      
      // Validate params
      if (schema.params) {
        Object.keys(schema.params).forEach((key) => {
          const validator = schema.params[key];
          try {
            if (validator.required && !req.params[key]) {
              errors[key] = `${key} is required`;
            } else if (req.params[key] && validator.validate) {
              req.params[key] = validator.validate(req.params[key]);
            }
          } catch (err) {
            errors[key] = err.message;
          }
        });
      }
      
      // Validate query
      if (schema.query) {
        Object.keys(schema.query).forEach((key) => {
          const validator = schema.query[key];
          try {
            if (validator.required && !req.query[key]) {
              errors[key] = `${key} is required`;
            } else if (req.query[key] && validator.validate) {
              req.query[key] = validator.validate(req.query[key]);
            }
          } catch (err) {
            errors[key] = err.message;
          }
        });
      }
      
      // If there are errors, throw ValidationError
      if (Object.keys(errors).length > 0) {
        throw new ValidationError('Validation failed', errors);
      }
      
      next();
    } catch (err) {
      next(err);
    }
  };
};

/**
 * Sanitize input (remove dangerous characters)
 */
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  
  return input
    .replace(/[<>]/g, '') // Remove < and >
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim();
};

/**
 * Sanitize object (recursively sanitize all string values)
 */
const sanitizeObject = (obj) => {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  
  const sanitized = {};
  Object.keys(obj).forEach((key) => {
    if (typeof obj[key] === 'string') {
      sanitized[key] = sanitizeInput(obj[key]);
    } else if (typeof obj[key] === 'object') {
      sanitized[key] = sanitizeObject(obj[key]);
    } else {
      sanitized[key] = obj[key];
    }
  });
  
  return sanitized;
};

/**
 * Input sanitization middleware
 */
const sanitizeRequest = (req, res, next) => {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }
  next();
};

module.exports = {
  validatePhone,
  validateEmail,
  validatePin,
  validateAmount,
  validateDate,
  validateRole,
  validateTransactionType,
  validateStatus,
  validateObjectId,
  validateRequired,
  validateLength,
  validatePagination,
  validateDateRange,
  validate,
  sanitizeInput,
  sanitizeObject,
  sanitizeRequest,
};
