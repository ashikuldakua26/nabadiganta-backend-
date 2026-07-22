const jwt = require("jsonwebtoken");

function generateToken(user) {
  // Extract only the ID from branch — it may be a populated object or a raw ObjectId
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
    process.env.JWT_SECRET || "dev_secret_key",
    { expiresIn: "12h" }
  );
}

module.exports = {
  generateToken,
};
