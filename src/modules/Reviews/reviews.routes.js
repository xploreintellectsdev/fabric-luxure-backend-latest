const express = require("express");
const router = express.Router();
const reviewsController = require("./reviews.controller");

// Public endpoints
router.post("/", reviewsController.submitReview);
router.get("/all", reviewsController.getAllReviews);
router.get("/product/:productId", reviewsController.getProductReviews);

module.exports = router;
