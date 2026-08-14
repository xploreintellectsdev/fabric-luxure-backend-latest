const wishlistService = require("./wishlist.service");

// ========================
// GET WISHLIST
// ========================
const getWishlist = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.user_id;
    const result = await wishlistService.getWishlist(userId);
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error("❌ Get Wishlist Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ========================
// ADD TO WISHLIST
// ========================
const addToWishlist = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.user_id;
    const { pro_id } = req.body;

    if (!pro_id) {
      return res.status(400).json({ success: false, error: "Product ID (pro_id) is required." });
    }

    // Check duplicate
    const existing = await wishlistService.getWishlistItem(userId, pro_id);
    if (existing) {
      return res.status(200).json({
        success: true,
        message: "Product already in wishlist",
        data: existing
      });
    }

    // Get next order
    const maxOrder = await wishlistService.getMaxOrder(userId);
    const nextOrder = maxOrder + 1;

    const result = await wishlistService.addToWishlist(userId, pro_id, nextOrder);
    return res.status(201).json({
      success: true,
      message: "Product added to wishlist successfully",
      data: result
    });
  } catch (error) {
    console.error("❌ Add To Wishlist Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ========================
// REMOVE FROM WISHLIST
// ========================
const removeFromWishlist = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.user_id;
    const { productId } = req.params;

    if (!productId) {
      return res.status(400).json({ success: false, error: "Product ID parameter is required." });
    }

    await wishlistService.removeFromWishlist(userId, productId);
    return res.status(200).json({
      success: true,
      message: "Product removed from wishlist successfully"
    });
  } catch (error) {
    console.error("❌ Remove From Wishlist Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ========================
// SYNC WISHLIST
// ========================
const syncWishlist = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.user_id;
    const { products } = req.body;

    if (!products || !Array.isArray(products)) {
      return res.status(400).json({ success: false, error: "Products array is required." });
    }

    let maxOrder = await wishlistService.getMaxOrder(userId);

    for (const proId of products) {
      const existing = await wishlistService.getWishlistItem(userId, proId);
      if (!existing) {
        maxOrder += 1;
        await wishlistService.addToWishlist(userId, proId, maxOrder);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Guest wishlist synced successfully"
    });
  } catch (error) {
    console.error("❌ Sync Wishlist Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

module.exports = {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  syncWishlist
};
