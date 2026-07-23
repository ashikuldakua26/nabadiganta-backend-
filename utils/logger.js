/**
 * Professional Logging System
 * Structured logging for production environments
 * Version: 1.0.0
 */

const fs = require('fs');
const path = require('path');

// Log levels
const LogLevel = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG',
};

// Colors for console output
const colors = {
  ERROR: '\x1b[31m', // Red
  WARN: '\x1b[33m',  // Yellow
  INFO: '\x1b[36m',  // Cyan
  DEBUG: '\x1b[35m', // Magenta
  RESET: '\x1b[0m',
};

class Logger {
  constructor() {
    this.logsDir = path.join(__dirname, '..', 'logs');
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    try {
      if (!fs.existsSync(this.logsDir)) {
        fs.mkdirSync(this.logsDir, { recursive: true });
      }
    } catch (_) {
      // Vercel read-only filesystem — skip file logging
    }
  }

  formatMessage(level, message, metadata = {}) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...metadata,
    });
  }

  writeToFile(level, message) {
    try {
      const filename = path.join(
        this.logsDir,
        `${new Date().toISOString().split('T')[0]}.log`
      );
      fs.appendFileSync(filename, message + '\n', 'utf8');
    } catch (_) {
      // Vercel read-only filesystem — skip file logging
    }
  }

  log(level, message, metadata = {}) {
    const formattedMessage = this.formatMessage(level, message, metadata);

    // Console output with colors
    if (process.env.NODE_ENV !== 'test') {
      const color = colors[level] || colors.RESET;
      console.log(`${color}[${level}]${colors.RESET} ${message}`, metadata);
    }

    // File output
    if (process.env.NODE_ENV === 'production') {
      this.writeToFile(level, formattedMessage);
    }
  }

  error(message, error = null, metadata = {}) {
    this.log(LogLevel.ERROR, message, {
      ...metadata,
      ...(error && {
        error: {
          message: error.message,
          stack: error.stack,
          code: error.code,
        },
      }),
    });
  }

  warn(message, metadata = {}) {
    this.log(LogLevel.WARN, message, metadata);
  }

  info(message, metadata = {}) {
    this.log(LogLevel.INFO, message, metadata);
  }

  debug(message, metadata = {}) {
    if (process.env.NODE_ENV === 'development') {
      this.log(LogLevel.DEBUG, message, metadata);
    }
  }

  // Request logging
  logRequest(req, res, duration) {
    this.info('HTTP Request', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userId: req.user?.userId,
    });
  }

  // Database logging
  logDatabase(operation, collection, duration, error = null) {
    if (error) {
      this.error('Database Error', error, { operation, collection, duration });
    } else {
      this.debug('Database Operation', { operation, collection, duration });
    }
  }

  // Authentication logging
  logAuth(action, phone, success, metadata = {}) {
    this.info('Authentication', {
      action,
      phone,
      success,
      ...metadata,
    });
  }

  // Business logic logging
  logBusiness(action, metadata = {}) {
    this.info('Business Logic', {
      action,
      ...metadata,
    });
  }
}

// Create singleton instance
const logger = new Logger();

/**
 * Request logging middleware
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();

  // Log when response finishes
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.logRequest(req, res, duration);
  });

  next();
};

module.exports = {
  logger,
  requestLogger,
  LogLevel,
};
