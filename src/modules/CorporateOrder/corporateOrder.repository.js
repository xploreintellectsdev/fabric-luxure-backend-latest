const ConnectDB = require("../../config/db");

const getExecutor = (connection) => {
  return connection || ConnectDB;
};

// Create a new corporate order enquiry
const createEnquiry = async (data, conn = null) => {
  const executor = getExecutor(conn);
  const query = `
    INSERT INTO corporate_order_enquiries (
      user_id, name, email, mobile, company_name, message, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'NEW', NOW(), NOW())
  `;
  const params = [
    data.user_id || null,
    data.name,
    data.email,
    data.mobile,
    data.company_name,
    data.message
  ];
  
  const [result] = await executor.execute(query, params);
  return { id: result.insertId, ...data, status: 'NEW' };
};

// Get enquiries for admin dashboard with pagination
const getEnquiries = async (page = 1, limit = 10, search = '', conn = null) => {
  const executor = getExecutor(conn);
  const offset = (page - 1) * limit;
  let query = "SELECT *, enquiry_id as id FROM corporate_order_enquiries";
  const params = [];
  
  if (search) {
    query += " WHERE name LIKE ? OR email LIKE ? OR company_name LIKE ?";
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }
  
  query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  params.push(Number(limit), Number(offset));
  
  const [rows] = await executor.query(query, params);
  
  // Get total count
  let countQuery = "SELECT COUNT(*) as total FROM corporate_order_enquiries";
  const countParams = [];
  if (search) {
    countQuery += " WHERE name LIKE ? OR email LIKE ? OR company_name LIKE ?";
    const searchTerm = `%${search}%`;
    countParams.push(searchTerm, searchTerm, searchTerm);
  }
  
  const [countResult] = await executor.query(countQuery, countParams);
  const total = countResult[0].total;
  
  return {
    enquiries: rows,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};

// Get single enquiry by ID
const getEnquiryById = async (id, conn = null) => {
  const executor = getExecutor(conn);
  const [rows] = await executor.execute("SELECT *, enquiry_id as id FROM corporate_order_enquiries WHERE enquiry_id = ?", [id]);
  return rows[0] || null;
};

// Update enquiry status
const updateEnquiryStatus = async (id, status, conn = null) => {
  const executor = getExecutor(conn);
  const query = "UPDATE corporate_order_enquiries SET status = ?, updated_at = NOW() WHERE enquiry_id = ?";
  const [result] = await executor.execute(query, [status, id]);
  return result.affectedRows > 0;
};

module.exports = {
  createEnquiry,
  getEnquiries,
  getEnquiryById,
  updateEnquiryStatus
};
