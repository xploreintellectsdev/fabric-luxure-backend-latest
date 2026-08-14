const express = require("express");
const router = express.Router();
const cartController = require("./cart.controller");
const { authenticateToken } = require("../../middleware/auth.middleware");

// All routes are secured
router.get("/", authenticateToken, cartController.getCart);
router.post("/", authenticateToken, cartController.addToCart);
router.patch("/:id", authenticateToken, cartController.updateCart);
router.delete("/:id", authenticateToken, cartController.removeFromCart);
router.get("/count", authenticateToken, cartController.getCartCount);
router.post("/merge", authenticateToken, cartController.mergeCart);

module.exports = router;
