const ConnectDB = require("../../config/db");

// ========================
// Get Cart items for a user
// ========================
const getCart = async (userId) => {
  const query = `
    SELECT c.*, pm.pro_name, pm.price, pm.stitching_price, pm.pro_img, pm.cover_description, pt.product_type AS pro_type_name,
           mp.placement_name, mc.color_name, mf.font_name
    FROM cart c
    INNER JOIN product_master pm ON c.pro_id = pm.pro_id
    LEFT JOIN product_category pc ON pm.cat_id = pc.cat_id
    LEFT JOIN product_type pt ON pc.pro_type_id = pt.pro_type_id
    LEFT JOIN monogram_placements mp ON c.monogram_placement_id = mp.placement_id
    LEFT JOIN monogram_colors mc ON c.monogram_color_id = mc.color_id
    LEFT JOIN monogram_fonts mf ON c.monogram_font_id = mf.font_id
    WHERE c.user_id = ?
    ORDER BY c.cart_order ASC, c.created_at DESC
  `;
  const [rows] = await ConnectDB.execute(query, [userId]);
  return rows.map(row => {
    if (row.monogram_enabled) {
      row.monogram = {
        enabled: true,
        type: row.monogram_type || (row.monogram_upload_file ? 'upload' : 'text'),
        text: row.monogram_text,
        placement_id: row.monogram_placement_id,
        placement_name: row.placement_name,
        color_id: row.monogram_color_id,
        color_name: row.color_name,
        font_id: row.monogram_font_id,
        font_name: row.font_name,
        extra_price: row.monogram_price || 0,
        upload_file: row.monogram_upload_file,
        upload_file_type: row.monogram_upload_file_type,
        file_name: row.monogram_file_name
      };
    }
    return row;
  });
};

// ========================
// Get items by user and product for duplicate checking
// ========================
const getCartItemsByProduct = async (userId, productId) => {
  const query = "SELECT * FROM cart WHERE user_id = ? AND pro_id = ?";
  const [rows] = await ConnectDB.execute(query, [userId, productId]);
  return rows;
};

// ========================
// Get single cart item by ID
// ========================
const getCartItemById = async (cartId) => {
  const query = "SELECT * FROM cart WHERE cart_id = ?";
  const [rows] = await ConnectDB.execute(query, [cartId]);
  return rows[0] || null;
};

// ========================
// Get max order index
// ========================
const getMaxOrder = async (userId) => {
  const query = "SELECT MAX(cart_order) as maxOrder FROM cart WHERE user_id = ?";
  const [rows] = await ConnectDB.execute(query, [userId]);
  return rows[0].maxOrder || 0;
};

// ========================
// Add to Cart
// ========================
const addToCart = async (userId, data) => {
  const monogram = data.monogram || {};
  const monogramEnabled = monogram.enabled ? 1 : 0;

  const query = `
    INSERT INTO cart (
      user_id, pro_id, fit_style, selected_size, selected_meter, is_custom,
      custom_chest, custom_length, custom_shoulder, custom_sleeve, selected_sleeve,
      custom_waist, custom_inseam, custom_hip, custom_thigh, custom_knee, custom_leg_opening,
      monogram_enabled, monogram_text, monogram_placement_id, monogram_color_id, monogram_font_id, monogram_price,
      monogram_type, monogram_upload_file, monogram_upload_file_type, monogram_file_name,
      quantity, cart_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
  `;
  const params = [
    userId,
    data.pro_id,
    data.fit_style || null,
    data.selected_size || null,
    data.selected_meter || null,
    data.is_custom ? 1 : 0,
    data.custom_chest || null,
    data.custom_length || null,
    data.custom_shoulder || null,
    data.custom_sleeve || null,
    data.selected_sleeve || null,
    data.custom_waist || null,
    data.custom_inseam || null,
    data.custom_hip || null,
    data.custom_thigh || null,
    data.custom_knee || null,
    data.custom_leg_opening || null,
    monogramEnabled,
    monogram.text || null,
    monogram.placement_id || null,
    monogram.color_id || null,
    monogram.font_id || null,
    monogram.extra_price || null,
    monogram.type || null,
    monogram.upload_file || null,
    monogram.upload_file_type || null,
    monogram.file_name || null,
    data.quantity || 1,
    data.cart_order || 0
  ];
  const [result] = await ConnectDB.execute(query, params);
  return { cart_id: result.insertId, ...data };
};

// ========================
// Update Quantity
// ========================
const updateQuantity = async (cartId, quantity) => {
  const query = "UPDATE cart SET quantity = ?, updated_at = NOW() WHERE cart_id = ?";
  await ConnectDB.execute(query, [quantity, cartId]);
  return { cart_id: cartId, quantity };
};

// ========================
// Remove from Cart
// ========================
const removeFromCart = async (cartId) => {
  const query = "DELETE FROM cart WHERE cart_id = ?";
  await ConnectDB.execute(query, [cartId]);
  return { success: true };
};

// ========================
// Clear Cart
// ========================
const clearCart = async (userId) => {
  const query = "DELETE FROM cart WHERE user_id = ?";
  await ConnectDB.execute(query, [userId]);
  return { success: true };
};

module.exports = {
  getCart,
  getCartItemsByProduct,
  getCartItemById,
  getMaxOrder,
  addToCart,
  updateQuantity,
  removeFromCart,
  clearCart
};
