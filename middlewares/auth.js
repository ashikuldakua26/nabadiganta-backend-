const jwt = require("jsonwebtoken");

function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    return res.status(401).json({ message: "Unauthorized: token missing" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "dev_secret_key");
    req.user = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized: invalid token" });
  }
}

function flattenRoles(roles) {
  if (!roles) return [];
  if (Array.isArray(roles)) {
    return roles.flatMap(flattenRoles);
  }
  return [roles];
}

function authorize(...allowedRoles) {
  const roles = flattenRoles(allowedRoles);

  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden: insufficient permission" });
    }

    return next();
  };
}

module.exports = {
  authenticate,
  authorize,
};
