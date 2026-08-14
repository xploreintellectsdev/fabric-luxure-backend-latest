const ConnectDB = require("../../config/db");

const getBlogs = async (search = "", sort = "order_no", order = "ASC", limit = 10, offset = 0, statusFilter = "") => {
  const connection = await ConnectDB.getConnection();
  try {
    let query = "SELECT * FROM blogs";
    const queryParams = [];
    const conditions = [];

    if (search) {
      conditions.push("(blog_title LIKE ?)");
      queryParams.push(`%${search}%`);
    }

    if (statusFilter !== "") {
      conditions.push("is_active = ?");
      queryParams.push(statusFilter === "true" || statusFilter === "1" ? 1 : 0);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    // Count total rows for pagination
    let countQuery = "SELECT COUNT(*) as total FROM blogs";
    if (conditions.length > 0) {
      countQuery += " WHERE " + conditions.join(" AND ");
    }
    const [countRows] = await connection.query(countQuery, queryParams);
    const total = countRows[0].total;

    // Sorting and pagination
    query += ` ORDER BY ${sort} ${order} LIMIT ? OFFSET ?`;
    queryParams.push(limit, offset);

    const [rows] = await connection.query(query, queryParams);
    return { rows, total };
  } finally {
    connection.release();
  }
};

const getBlogById = async (id) => {
  const connection = await ConnectDB.getConnection();
  try {
    const [rows] = await connection.query("SELECT * FROM blogs WHERE blog_id = ?", [id]);
    return rows[0];
  } finally {
    connection.release();
  }
};

const createBlog = async (data) => {
  const connection = await ConnectDB.getConnection();
  try {
    const { order_no, published_date, blog_title, blog_image, short_description, blog_content, is_active } = data;
    const [result] = await connection.query(
      `INSERT INTO blogs (order_no, published_date, blog_title, blog_image, short_description, blog_content, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [order_no, published_date, blog_title, blog_image, short_description, blog_content, is_active]
    );
    return result.insertId;
  } finally {
    connection.release();
  }
};

const updateBlog = async (id, data) => {
  const connection = await ConnectDB.getConnection();
  try {
    const { order_no, published_date, blog_title, blog_image, short_description, blog_content, is_active } = data;
    let query = "UPDATE blogs SET order_no = ?, published_date = ?, blog_title = ?, short_description = ?, blog_content = ?, is_active = ?";
    const params = [order_no, published_date, blog_title, short_description, blog_content, is_active];
    
    if (blog_image) {
      query += ", blog_image = ?";
      params.push(blog_image);
    }
    
    query += " WHERE blog_id = ?";
    params.push(id);

    const [result] = await connection.query(query, params);
    return result.affectedRows > 0;
  } finally {
    connection.release();
  }
};

const deleteBlog = async (id) => {
  const connection = await ConnectDB.getConnection();
  try {
    const [result] = await connection.query("DELETE FROM blogs WHERE blog_id = ?", [id]);
    return result.affectedRows > 0;
  } finally {
    connection.release();
  }
};

module.exports = {
  getBlogs,
  getBlogById,
  createBlog,
  updateBlog,
  deleteBlog
};
