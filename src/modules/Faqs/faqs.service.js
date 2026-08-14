const ConnectDB = require("../../config/db");

const getFaqs = async (search = "", sort = "display_order", order = "ASC", limit = 10, offset = 0) => {
  let query = "SELECT * FROM faqs";
  const params = [];

  if (search) {
    query += " WHERE (question LIKE ? OR answer LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
  }

  const validSortColumns = ["faq_id", "question", "display_order", "is_active", "created_at"];
  if (validSortColumns.includes(sort)) {
    query += ` ORDER BY ${sort} ${order === "DESC" ? "DESC" : "ASC"}`;
  } else {
    query += " ORDER BY display_order ASC";
  }

  if (limit > 0) {
    query += " LIMIT ? OFFSET ?";
    params.push(Number(limit), Number(offset));
  }

  const [rows] = await ConnectDB.query(query, params);

  // Count query
  let countQuery = "SELECT COUNT(*) as total FROM faqs";
  const countParams = [];
  if (search) {
    countQuery += " WHERE (question LIKE ? OR answer LIKE ?)";
    countParams.push(`%${search}%`, `%${search}%`);
  }
  const [countRows] = await ConnectDB.query(countQuery, countParams);
  
  return {
    rows,
    total: countRows[0].total
  };
};

const getActiveFaqs = async () => {
  const query = "SELECT * FROM faqs WHERE is_active = 1 ORDER BY display_order ASC, faq_id ASC";
  const [rows] = await ConnectDB.query(query);
  return rows;
};

const createFaq = async (data) => {
  const { question, answer, display_order, is_active } = data;
  const targetOrder = display_order || 1;

  // Make room if the display_order is already taken
  const [existing] = await ConnectDB.query("SELECT faq_id FROM faqs WHERE display_order = ?", [targetOrder]);
  if (existing.length > 0) {
    await ConnectDB.query("UPDATE faqs SET display_order = display_order + 1 WHERE display_order >= ?", [targetOrder]);
  }

  const query = "INSERT INTO faqs (question, answer, display_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())";
  const [result] = await ConnectDB.query(query, [
    question, 
    answer, 
    targetOrder, 
    is_active !== undefined ? is_active : 1
  ]);
  return result.insertId;
};

const updateFaq = async (id, data) => {
  const { question, answer, display_order, is_active } = data;

  // Check if another FAQ has this display_order
  const [existing] = await ConnectDB.query("SELECT faq_id, display_order FROM faqs WHERE display_order = ? AND faq_id != ?", [display_order, id]);
  if (existing.length > 0) {
    // Find the old display_order of the current FAQ to swap
    const [currentFaq] = await ConnectDB.query("SELECT display_order FROM faqs WHERE faq_id = ?", [id]);
    if (currentFaq.length > 0) {
      const oldOrder = currentFaq[0].display_order;
      await ConnectDB.query("UPDATE faqs SET display_order = ? WHERE faq_id = ?", [oldOrder, existing[0].faq_id]);
    }
  }

  const query = "UPDATE faqs SET question = ?, answer = ?, display_order = ?, is_active = ?, updated_at = NOW() WHERE faq_id = ?";
  const [result] = await ConnectDB.query(query, [
    question,
    answer,
    display_order,
    is_active,
    id
  ]);
  return result.affectedRows > 0;
};

const updateFaqStatus = async (id, isActive) => {
  const query = "UPDATE faqs SET is_active = ?, updated_at = NOW() WHERE faq_id = ?";
  const [result] = await ConnectDB.query(query, [isActive, id]);
  return result.affectedRows > 0;
};

module.exports = {
  getFaqs,
  getActiveFaqs,
  createFaq,
  updateFaq,
  updateFaqStatus
};
