const ConnectDB = require("../../config/db");

const checkProductExists = async (productId) => {
  const query = `SELECT pro_id FROM product_master WHERE pro_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)`;
  const [rows] = await ConnectDB.execute(query, [productId]);
  return rows.length > 0;
};

const submitReview = async (data) => {
  const { product_id, user_id, customer_name, customer_email, customer_mobile, rating, review_message } = data;
  const query = `
    INSERT INTO product_reviews 
    (product_id, user_id, customer_name, customer_email, customer_mobile, rating, review_message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
  `;
  const [result] = await ConnectDB.execute(query, [
    product_id, 
    user_id || null, 
    customer_name, 
    customer_email, 
    customer_mobile || null, 
    rating, 
    review_message
  ]);
  return result;
};

const getProductReviews = async (productId) => {
  const queryStats = `
    SELECT 
      COUNT(*) as total_reviews, 
      IFNULL(AVG(rating), 0) as average_rating 
    FROM product_reviews 
    WHERE product_id = ?
  `;
  const [stats] = await ConnectDB.execute(queryStats, [productId]);
  
  const queryList = `
    SELECT * 
    FROM product_reviews 
    WHERE product_id = ? 
    ORDER BY created_at DESC
  `;
  const [reviews] = await ConnectDB.execute(queryList, [productId]);

  return {
    average_rating: parseFloat(parseFloat(stats[0].average_rating).toFixed(1)),
    total_reviews: stats[0].total_reviews,
    reviews
  };
};

const getAdminReviewProducts = async () => {
  const query = `
    SELECT 
      pm.pro_id AS product_id,
      pm.pro_name AS product_name,
      pm.pro_img AS product_image,
      COUNT(pr.review_id) AS total_reviews,
      IFNULL(AVG(pr.rating), 0) AS average_rating
    FROM product_master pm
    LEFT JOIN product_reviews pr ON pm.pro_id = pr.product_id
    WHERE pm.is_deleted = 0 OR pm.is_deleted IS NULL
    GROUP BY pm.pro_id, pm.pro_name, pm.pro_img
    ORDER BY total_reviews DESC, pm.pro_id DESC
  `;
  const [rows] = await ConnectDB.execute(query);
  return rows.map(row => ({
    ...row,
    average_rating: parseFloat(parseFloat(row.average_rating).toFixed(1))
  }));
};

const getAdminProductReviews = async (productId) => {
  const query = `
    SELECT *
    FROM product_reviews
    WHERE product_id = ?
    ORDER BY created_at DESC
  `;
  const [rows] = await ConnectDB.execute(query, [productId]);
  return rows;
};

const deleteReview = async (reviewId) => {
  const query = `
    DELETE FROM product_reviews
    WHERE review_id = ?
  `;
  const [result] = await ConnectDB.execute(query, [reviewId]);
  return result;
};

const getAllReviews = async () => {
  const query = `
    SELECT pr.*, pm.pro_name as product_name
    FROM product_reviews pr
    LEFT JOIN product_master pm ON pr.product_id = pm.pro_id
    ORDER BY pr.created_at DESC
  `;
  const [rows] = await ConnectDB.execute(query);
  return rows;
};

module.exports = {
  checkProductExists,
  submitReview,
  getProductReviews,
  getAdminReviewProducts,
  getAdminProductReviews,
  deleteReview,
  getAllReviews
};
