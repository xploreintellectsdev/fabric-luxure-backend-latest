const ConnectDB = require("../../config/db");

// ========================
// Get Wishlist items for a user
// ========================
const getWishlist = async (userId) => {
  const query = `
    SELECT w.wishlist_id, w.pro_id, pm.pro_name, pm.cover_description, pm.price, pm.pro_img, pt.product_type AS product_type_name
    FROM wishlist w
    INNER JOIN product_master pm ON w.pro_id = pm.pro_id
    LEFT JOIN product_category pc ON pm.cat_id = pc.cat_id
    LEFT JOIN product_type pt ON pc.pro_type_id = pt.pro_type_id
    WHERE w.user_id = ?
    ORDER BY w.wishlist_order ASC
  `;
  const [rows] = await ConnectDB.execute(query, [userId]);
  return rows;
};

// ========================
// Get single wishlist item
// ========================
const getWishlistItem = async (userId, productId) => {
  const query = `
    SELECT * FROM wishlist
    WHERE user_id = ? AND pro_id = ?
  `;
  const [rows] = await ConnectDB.execute(query, [userId, productId]);
  return rows.length > 0 ? rows[0] : null;
};

// ========================
// Get max wishlist_order
// ========================
const getMaxOrder = async (userId) => {
  const query = `
    SELECT MAX(wishlist_order) AS max_order FROM wishlist
    WHERE user_id = ?
  `;
  const [rows] = await ConnectDB.execute(query, [userId]);
  return rows[0].max_order !== null ? rows[0].max_order : 0;
};

// ========================
// Add item to wishlist
// ========================
const addToWishlist = async (userId, productId, order) => {
  const query = `
    INSERT INTO wishlist (user_id, pro_id, wishlist_order, created_at)
    VALUES (?, ?, ?, NOW())
  `;
  const [result] = await ConnectDB.execute(query, [userId, productId, order]);
  return {
    wishlist_id: result.insertId,
    user_id: userId,
    pro_id: productId,
    wishlist_order: order
  };
};

// ========================
// Remove item from wishlist
// ========================
const removeFromWishlist = async (userId, productId) => {
  const query = `
    DELETE FROM wishlist
    WHERE user_id = ? AND pro_id = ?
  `;
  const [result] = await ConnectDB.execute(query, [userId, productId]);
  return result.affectedRows > 0;
};

module.exports = {
  getWishlist,
  getWishlistItem,
  getMaxOrder,
  addToWishlist,
  removeFromWishlist
};
