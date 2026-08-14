const ConnectDB = require("../../config/db");

const getEvents = async (search = "", sort = "order_no", order = "ASC", limit = 10, offset = 0, statusFilter = "") => {
  const connection = await ConnectDB.getConnection();
  try {
    let query = "SELECT * FROM events";
    const queryParams = [];
    const conditions = [];

    if (search) {
      conditions.push("(event_title LIKE ?)");
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
    let countQuery = "SELECT COUNT(*) as total FROM events";
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

const getEventById = async (id) => {
  const connection = await ConnectDB.getConnection();
  try {
    const [rows] = await connection.query("SELECT * FROM events WHERE event_id = ?", [id]);
    return rows[0];
  } finally {
    connection.release();
  }
};

const createEvent = async (data) => {
  const connection = await ConnectDB.getConnection();
  try {
    const { order_no, event_date, event_title, media_type, event_media, short_description, is_active } = data;
    const [result] = await connection.query(
      `INSERT INTO events (order_no, event_date, event_title, media_type, event_media, short_description, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [order_no, event_date, event_title, media_type, event_media, short_description, is_active]
    );
    return result.insertId;
  } finally {
    connection.release();
  }
};

const updateEvent = async (id, data) => {
  const connection = await ConnectDB.getConnection();
  try {
    const { order_no, event_date, event_title, media_type, event_media, short_description, is_active } = data;
    let query = "UPDATE events SET order_no = ?, event_date = ?, event_title = ?, media_type = ?, short_description = ?, is_active = ?";
    const params = [order_no, event_date, event_title, media_type, short_description, is_active];
    
    if (event_media) {
      query += ", event_media = ?";
      params.push(event_media);
    }
    
    query += " WHERE event_id = ?";
    params.push(id);

    const [result] = await connection.query(query, params);
    return result.affectedRows > 0;
  } finally {
    connection.release();
  }
};

const deleteEvent = async (id) => {
  const connection = await ConnectDB.getConnection();
  try {
    const [result] = await connection.query("DELETE FROM events WHERE event_id = ?", [id]);
    return result.affectedRows > 0;
  } finally {
    connection.release();
  }
};

module.exports = {
  getEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent
};
