const express = require("express");
const router = express.Router();
const wishlistController = require("./wishlist.controller");
const { authenticateToken } = require("../../middleware/auth.middleware");

// All wishlist routes require token validation
router.use(authenticateToken);

router.get("/", wishlistController.getWishlist);
router.post("/", wishlistController.addToWishlist);
router.delete("/:productId", wishlistController.removeFromWishlist);
router.post("/sync", wishlistController.syncWishlist);

module.exports = router;
