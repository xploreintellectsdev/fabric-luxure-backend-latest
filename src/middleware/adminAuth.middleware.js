const jwt = require("jsonwebtoken");

// Allows both SUPERADMIN and ADMIN
const authenticateAdminToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: "Access token is required. Please sign in.",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const role = decoded.role ? decoded.role.toUpperCase() : "";
    if (role !== "ADMIN" && role !== "SUPERADMIN") {
      return res.status(403).json({
        success: false,
        error: "Access denied. Admin privileges required.",
      });
    }
    req.admin = decoded;
    next();
  } catch (error) {
    console.error("❌ Admin JWT Verification Error:", error.message);
    return res.status(403).json({
      success: false,
      error: "Invalid or expired access token.",
    });
  }
};

// strictly requires SUPERADMIN
const requireSuperAdmin = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: "Access token is required. Please sign in.",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const role = decoded.role ? decoded.role.toUpperCase() : "";
    if (role !== "SUPERADMIN") {
      return res.status(403).json({
        success: false,
        error: "Access denied. Superadmin privileges required.",
      });
    }
    req.admin = decoded;
    next();
  } catch (error) {
    console.error("❌ Superadmin JWT Verification Error:", error.message);
    return res.status(403).json({
      success: false,
      error: "Invalid or expired access token.",
    });
  }
};

module.exports = {
  authenticateAdminToken,
  requireSuperAdmin
};
