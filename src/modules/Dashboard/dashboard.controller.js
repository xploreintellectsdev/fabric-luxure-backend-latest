const ConnectDB = require("../../config/db");

const getDashboardStats = async (req, res) => {
  try {
    // 1. Total Products
    const [prodRes] = await ConnectDB.execute(
      "SELECT COUNT(*) AS count FROM product_master WHERE is_deleted = 0 OR is_deleted IS NULL"
    );
    const products = prodRes[0].count;

    // 2. Total Categories
    const [catRes] = await ConnectDB.execute(
      "SELECT COUNT(*) AS count FROM product_category"
    );
    const categories = catRes[0].count;

    // 3. Product Types
    const [typeRes] = await ConnectDB.execute(
      "SELECT COUNT(*) AS count FROM product_type"
    );
    const productTypes = typeRes[0].count;

    // 4. Top Picks
    const [topRes] = await ConnectDB.execute(
      "SELECT COUNT(*) AS count FROM product_master WHERE is_top_pics = 1 AND (is_deleted = 0 OR is_deleted IS NULL)"
    );
    const topPicks = topRes[0].count;

    // 5. Exclusive Products
    const [exRes] = await ConnectDB.execute(
      "SELECT COUNT(*) AS count FROM product_master WHERE is_exclusive = 1 AND (is_deleted = 0 OR is_deleted IS NULL)"
    );
    const exclusives = exRes[0].count;

    // 6. Total Users
    const [usersRes] = await ConnectDB.execute(
      "SELECT COUNT(*) AS count FROM users"
    );
    const users = usersRes[0].count;

    // 7. Recent Activities (from backend/initial set)
    const recentActivities = [
      { id: "act-init-1", user: "System", action: "Fabric Luxure database initialized", time: "Just now" }
    ];

    // 8. User Login History
    const [loginHistoryRes] = await ConnectDB.execute(`
      SELECT 
        lh.login_history_id AS id,
        lh.user_id,
        u.name AS user_name,
        lh.login_time,
        lh.login_status,
        lh.ip_address
      FROM user_login_history lh
      JOIN users u ON lh.user_id = u.user_id
      ORDER BY lh.login_time DESC
      LIMIT 20
    `);

    return res.status(200).json({
      success: true,
      data: {
        products,
        categories,
        productTypes,
        topPicks,
        exclusives,
        users,
        recentActivities,
        userLoginHistory: loginHistoryRes,
      },
    });
  } catch (error) {
    console.error("❌ Dashboard Stats Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

module.exports = {
  getDashboardStats,
};
