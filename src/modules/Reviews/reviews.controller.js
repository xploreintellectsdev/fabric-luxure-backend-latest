const reviewsService = require("./reviews.service");

const submitReview = async (req, res) => {
  try {
    const { product_id, user_id, customer_name, customer_email, customer_mobile, rating, review_message } = req.body;

    // Validation
    if (!product_id) {
      return res.status(400).json({ success: false, error: "product_id is required" });
    }
    if (!customer_name) {
        return res.status(400).json({ success: false, error: "customer_name is required" });
    }
    if (!customer_email) {
        return res.status(400).json({ success: false, error: "customer_email is required" });
    }
    if (!review_message) {
        return res.status(400).json({ success: false, error: "review_message is required" });
    }
    if (rating === undefined || rating < 1 || rating > 5) {
        return res.status(400).json({ success: false, error: "rating must be between 1 and 5" });
    }

    // Check if product exists
    const productExists = await reviewsService.checkProductExists(product_id);
    if (!productExists) {
        return res.status(404).json({ success: false, error: "Product not found" });
    }

    await reviewsService.submitReview({
      product_id,
      user_id,
      customer_name,
      customer_email,
      customer_mobile,
      rating,
      review_message
    });

    return res.status(201).json({
      success: true,
      message: "Review submitted successfully"
    });
  } catch (error) {
    console.error("❌ Submit Review Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

const getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    
    // Check if product exists (optional but good practice)
    const productExists = await reviewsService.checkProductExists(productId);
    if (!productExists) {
        return res.status(404).json({ success: false, error: "Product not found" });
    }

    const data = await reviewsService.getProductReviews(productId);
    
    return res.status(200).json({
      success: true,
      ...data
    });
  } catch (error) {
    console.error("❌ Get Product Reviews Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

const getAdminReviewProducts = async (req, res) => {
  try {
    const data = await reviewsService.getAdminReviewProducts();
    
    // The requirement states returning an array directly for this endpoint:
    // Response Example: [ { "product_id":24, ... } ]
    // But usually APIs return { success: true, data: [...] }. 
    // Given the prompt example, it's just an array, but we can return standard array.
    // Let's match the exact example from the prompt: return res.status(200).json(data);
    return res.status(200).json(data);
  } catch (error) {
    console.error("❌ Get Admin Review Products Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

const getAdminProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const data = await reviewsService.getAdminProductReviews(productId);
    return res.status(200).json(data);
  } catch (error) {
    console.error("❌ Get Admin Product Reviews Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

const deleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    await reviewsService.deleteReview(reviewId);
    return res.status(200).json({
      success: true,
      message: "Review deleted successfully"
    });
  } catch (error) {
    console.error("❌ Delete Review Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

const getAllReviews = async (req, res) => {
  try {
    const data = await reviewsService.getAllReviews();
    return res.status(200).json({
      success: true,
      reviews: data
    });
  } catch (error) {
    console.error("❌ Get All Reviews Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

module.exports = {
  submitReview,
  getProductReviews,
  getAdminReviewProducts,
  getAdminProductReviews,
  deleteReview,
  getAllReviews
};
