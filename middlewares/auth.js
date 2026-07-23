const jwt = require("jsonwebtoken");
const { AuthenticationError, AuthorizationError } = require("../utils/errors");

const getSecret = () =>
  process.env.JWT_SECRET || "nabadiganta_ngo_jwt_secret_2024_secure_key";

function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    return res.status(401).json({
      success: false,
      error: {
        message: "Unauthorized: token missing",
        code: "AUTH_ERROR",
        statusCode: 401,
        timestamp: new Date().toISOString(),
      },
    });
  }

  try {
    const decoded = jwt.verify(token, getSecret());
    req.user = decoded;
    return next();
  } catch (error) {
    const isExpired = error.name === "TokenExpiredError";
    return res.status(401).json({
      success: false,
      error: {
        message: isExpired
          ? "Session expired. Please log in again."
          : "Unauthorized: invalid token",
        code: isExpired ? "TOKEN_EXPIRED" : "INVALID_TOKEN",
        statusCode: 401,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

function authorize(...allowedRoles) {
  const roles = allowedRoles.flat(Infinity);

  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          message: "Forbidden: insufficient permission",
          code: "AUTHORIZATION_ERROR",
          statusCode: 403,
          timestamp: new Date().toISOString(),
        },
      });
    }

    return next();
  };
}

module.exports = {
  authenticate,
  authorize,
};
