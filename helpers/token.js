const jwt = require("jsonwebtoken");

// Use a guaranteed non-empty secret — falls back to the hardcoded value
// if neither .env nor Vercel dashboard has JWT_SECRET set
const getSecret = () =>
  process.env.JWT_SECRET || "nabadiganta_ngo_jwt_secret_2024_secure_key";

function generateToken(user) {
  const branchId = user.branch
    ? (user.branch._id || user.branch).toString()
    : null;

  return jwt.sign(
    {
      id:       user._id.toString(),
      role:     user.role,
      branchId: branchId,
      area:     user.area || "",
      name:     user.name || "",
    },
    getSecret(),
    { expiresIn: "12h" }
  );
}

module.exports = { generateToken };
