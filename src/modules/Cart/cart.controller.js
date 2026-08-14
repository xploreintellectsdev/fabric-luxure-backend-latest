const cartService = require("./cart.service");
const ConnectDB = require("../../config/db");

// Helper to check if two cart items match exactly
const isDuplicateMatch = (incoming, existing) => {
  return (
    String(incoming.fit_style || "") === String(existing.fit_style || "") &&
    String(incoming.selected_size || "") === String(existing.selected_size || "") &&
    String(incoming.selected_meter || "") === String(existing.selected_meter || "") &&
    Boolean(incoming.is_custom) === Boolean(existing.is_custom) &&
    String(incoming.custom_chest || "") === String(existing.custom_chest || "") &&
    String(incoming.custom_length || "") === String(existing.custom_length || "") &&
    String(incoming.custom_shoulder || "") === String(existing.custom_shoulder || "") &&
    String(incoming.custom_sleeve || "") === String(existing.custom_sleeve || "") &&
    String(incoming.selected_sleeve || "") === String(existing.selected_sleeve || "") &&
    (incoming.monogram?.enabled ? 1 : 0) === (existing.monogram_enabled ? 1 : 0) &&
    String(incoming.monogram?.text || "") === String(existing.monogram_text || "") &&
    String(incoming.monogram?.placement_id || "") === String(existing.monogram_placement_id || "") &&
    String(incoming.monogram?.color_id || "") === String(existing.monogram_color_id || "") &&
    String(incoming.monogram?.font_id || "") === String(existing.monogram_font_id || "") &&
    String(incoming.monogram?.upload_file || "") === String(existing.monogram_upload_file || "")
  );
};

// ========================
// GET CART
// ========================
const getCart = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.user_id;
    const items = await cartService.getCart(userId);
    return res.status(200).json({
      success: true,
      data: items
    });
  } catch (error) {
    console.error("❌ Get Cart Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ========================
// ADD TO CART
// ========================
const addToCart = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.user_id;
    const {
      pro_id,
      fit_style,
      selected_size,
      selected_meter,
      is_custom,
      custom_chest,
      custom_length,
      custom_shoulder,
      custom_sleeve,
      custom_waist,
      custom_inseam,
      custom_hip,
      custom_thigh,
      custom_knee,
      custom_leg_opening,
      selected_sleeve,
      monogram,
      quantity
    } = req.body;

    if (!pro_id) {
      return res.status(400).json({ success: false, error: "Product ID (pro_id) is required." });
    }

    const qty = parseInt(quantity, 10) || 1;

    // Fetch product stock info
    const [products] = await ConnectDB.query("SELECT stock_quantity, stock_unit FROM product_master WHERE pro_id = ?", [pro_id]);
    if (products.length === 0) {
      return res.status(404).json({ success: false, error: "Product not found." });
    }
    const productStock = products[0].stock_quantity || 0;
    const stockUnit = products[0].stock_unit;

    // Check duplicate
    const existingItems = await cartService.getCartItemsByProduct(userId, pro_id);
    const duplicate = existingItems.find(item => isDuplicateMatch({
      fit_style,
      selected_size,
      selected_meter,
      is_custom,
      custom_chest,
      custom_length,
      custom_shoulder,
      custom_sleeve,
      custom_waist,
      custom_inseam,
      custom_hip,
      custom_thigh,
      custom_knee,
      custom_leg_opening,
      selected_sleeve,
      monogram
    }, item));

    const incomingVariant = selected_meter ? `${selected_meter} Meter` : (selected_size || "Standard");
    const matchingProductFound = existingItems.length > 0 ? "YES" : "NO";
    const matchingVariantFound = duplicate ? "YES" : "NO";

    console.log("========================================");
    console.log("ADD TO CART");
    console.log("========================================");
    console.log(`User ID: ${userId}`);
    console.log(`Product ID: ${pro_id}`);
    console.log(`Selected Variant: ${incomingVariant}`);
    console.log(`Quantity Requested: ${qty}`);
    console.log("");
    console.log("Searching existing cart...");
    console.log("");
    console.log(`Matching Product Found: ${matchingProductFound}`);
    console.log(`Matching Variant Found: ${matchingVariantFound}`);
    console.log("");

    if (duplicate) {
      const newQty = duplicate.quantity + qty;
      const requestedAmt = stockUnit === 'METER' ? newQty * parseFloat(selected_meter || duplicate.selected_meter || "1") : newQty;
      
      if (requestedAmt > productStock) {
        return res.status(400).json({ success: false, error: `Only ${productStock} item(s) available.` });
      }

      const updated = await cartService.updateQuantity(duplicate.cart_id, newQty);

      console.log("Action: Increase Quantity");
      console.log(`Final Quantity: ${newQty}`);
      console.log("");
      console.log("Cart Status: SUCCESS");
      console.log("========================================");

      console.log("========================================");
      console.log(`Existing Variant: ${incomingVariant}`);
      console.log("Action: Quantity Increased");
      console.log(`Previous Qty: ${duplicate.quantity}`);
      console.log(`New Qty: ${newQty}`);
      console.log("========================================");

      return res.status(200).json({
        success: true,
        message: "Cart item quantity updated",
        data: updated
      });
    }

    // If matching product is found but different variant
    if (existingItems.length > 0) {
      const existingItem = existingItems[0];
      const existingVariant = existingItem.selected_meter ? `${existingItem.selected_meter} Meter` : (existingItem.selected_size || "Standard");
      
      console.log("Action: Create New Cart Item");
      console.log(`Final Quantity: ${qty}`);
      console.log("");
      console.log("Cart Status: SUCCESS");
      console.log("========================================");

      console.log("========================================");
      console.log(`Existing Variant: ${existingVariant}`);
      console.log(`New Variant: ${incomingVariant}`);
      console.log("Action: Created New Cart Row");
      console.log("========================================");
    } else {
      console.log("Action: Create New Cart Item");
      console.log(`Final Quantity: ${qty}`);
      console.log("");
      console.log("Cart Status: SUCCESS");
      console.log("========================================");
    }

    // Validate stock for new variant
    const newRequestedAmt = stockUnit === 'METER' ? qty * parseFloat(selected_meter || "1") : qty;
    if (newRequestedAmt > productStock) {
      return res.status(400).json({ success: false, error: `Only ${productStock} item(s) available.` });
    }

    // Get order index
    const maxOrder = await cartService.getMaxOrder(userId);
    const result = await cartService.addToCart(userId, {
      pro_id,
      fit_style,
      selected_size,
      selected_meter,
      is_custom,
      custom_chest,
      custom_length,
      custom_shoulder,
      custom_sleeve,
      custom_waist,
      custom_inseam,
      custom_hip,
      custom_thigh,
      custom_knee,
      custom_leg_opening,
      selected_sleeve,
      monogram,
      quantity: qty,
      cart_order: maxOrder + 1
    });

    return res.status(201).json({
      success: true,
      message: "Product added to cart successfully",
      data: result
    });
  } catch (error) {
    console.error("❌ Add To Cart Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ========================
// UPDATE CART ITEM (QUANTITY)
// ========================
const updateCart = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;

    if (!id || quantity === undefined) {
      return res.status(400).json({ success: false, error: "Cart ID and quantity are required." });
    }

    const qty = Math.max(1, parseInt(quantity, 10) || 1);

    // Fetch cart item and product stock info
    const [rows] = await ConnectDB.query(`
      SELECT c.selected_meter, c.quantity as old_qty, pm.stock_quantity, pm.stock_unit 
      FROM cart c
      INNER JOIN product_master pm ON c.pro_id = pm.pro_id
      WHERE c.cart_id = ?
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "Cart item not found." });
    }

    const item = rows[0];
    const productStock = item.stock_quantity || 0;
    const stockUnit = item.stock_unit;
    
    // Validate stock for the new total requested quantity
    const newRequestedAmt = stockUnit === 'METER' ? qty * parseFloat(item.selected_meter || "1") : qty;
    if (newRequestedAmt > productStock) {
      return res.status(400).json({ success: false, error: `Only ${productStock} item(s) available.` });
    }

    const updated = await cartService.updateQuantity(id, qty);
    return res.status(200).json({
      success: true,
      message: "Cart item updated successfully",
      data: updated
    });
  } catch (error) {
    console.error("❌ Update Cart Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ========================
// REMOVE FROM CART
// ========================
const removeFromCart = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, error: "Cart ID parameter is required." });
    }

    await cartService.removeFromCart(id);
    return res.status(200).json({
      success: true,
      message: "Cart item removed successfully"
    });
  } catch (error) {
    console.error("❌ Remove From Cart Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ========================
// GET CART COUNT
// ========================
const getCartCount = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.user_id;
    const items = await cartService.getCart(userId);
    const count = items.reduce((acc, item) => acc + (item.quantity || 0), 0);
    return res.status(200).json({
      success: true,
      count
    });
  } catch (error) {
    console.error("❌ Get Cart Count Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ========================
// SYNC/MERGE WISHLIST & CART
// ========================
const mergeCart = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.user_id;
    const { products } = req.body; // Array of guest cart items

    if (!products || !Array.isArray(products)) {
      return res.status(400).json({ success: false, error: "Products array is required." });
    }

    let maxOrder = await cartService.getMaxOrder(userId);

    for (const incoming of products) {
      const existingItems = await cartService.getCartItemsByProduct(userId, incoming.pro_id);
      const duplicate = existingItems.find(item => isDuplicateMatch(incoming, item));

      if (duplicate) {
        // Increment quantity
        const newQty = duplicate.quantity + (incoming.quantity || 1);
        await cartService.updateQuantity(duplicate.cart_id, newQty);
      } else {
        // Add new item
        maxOrder += 1;
        await cartService.addToCart(userId, {
          ...incoming,
          cart_order: maxOrder
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Guest cart merged successfully"
    });
  } catch (error) {
    console.error("❌ Merge Cart Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getCart,
  addToCart,
  updateCart,
  removeFromCart,
  getCartCount,
  mergeCart
};
