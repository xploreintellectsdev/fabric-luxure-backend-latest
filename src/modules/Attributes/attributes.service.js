const pool = require("../../config/db");

const getTableInfo = (type) => {
  const map = {
    "fabric-types": { table: "fabric_type_master", idField: "fabric_type_id", nameField: "fabric_type_name" },
    "fabric-origins": { table: "origin_master", idField: "origin_id", nameField: "origin_name" },
    "styles": { table: "style_master", idField: "style_id", nameField: "style_name" },
    "weaves": { table: "weave_master", idField: "weave_id", nameField: "weave_name" },
    "colors": { table: "color_master", idField: "color_id", nameField: "color_name", extraFields: ["color_code"] },
    "patterns": { table: "pattern_master", idField: "pattern_id", nameField: "pattern_name" },
  };
  return map[type];
};

const getAllAttributes = async (type) => {
  const info = getTableInfo(type);
  if (!info) throw new Error("Invalid attribute type");

  const [rows] = await pool.query(`SELECT * FROM ?? WHERE is_active = 1 ORDER BY created_at DESC`, [info.table]);
  return rows;
};

const getAttributeByName = async (type, name) => {
  const info = getTableInfo(type);
  if (!info) throw new Error("Invalid attribute type");

  const [rows] = await pool.query(
    `SELECT * FROM ?? WHERE LOWER(??) = LOWER(?) AND is_active = 1 LIMIT 1`,
    [info.table, info.nameField, name.trim()]
  );
  return rows[0];
};

const getAttributeById = async (type, id) => {
  const info = getTableInfo(type);
  if (!info) throw new Error("Invalid attribute type");

  const [rows] = await pool.query(
    `SELECT * FROM ?? WHERE ?? = ? AND is_active = 1 LIMIT 1`,
    [info.table, info.idField, id]
  );
  return rows[0];
};

const createAttribute = async (type, data) => {
  const info = getTableInfo(type);
  if (!info) throw new Error("Invalid attribute type");

  let query = `INSERT INTO ?? (??) VALUES (?)`;
  let values = [info.table, info.nameField, data.name.trim()];

  if (type === "colors" && data.color_code) {
    query = `INSERT INTO ?? (??, color_code) VALUES (?, ?)`;
    values = [info.table, info.nameField, data.name.trim(), data.color_code.trim()];
  }

  const [result] = await pool.query(query, values);
  return result;
};

const updateAttribute = async (type, id, data) => {
  const info = getTableInfo(type);
  if (!info) throw new Error("Invalid attribute type");

  let query = `UPDATE ?? SET ?? = ? WHERE ?? = ?`;
  let values = [info.table, info.nameField, data.name.trim(), info.idField, id];

  if (type === "colors" && data.color_code) {
    query = `UPDATE ?? SET ?? = ?, color_code = ? WHERE ?? = ?`;
    values = [info.table, info.nameField, data.name.trim(), data.color_code.trim(), info.idField, id];
  }

  const [result] = await pool.query(query, values);
  return result;
};

const checkAttributeUsage = async (type, id) => {
  const info = getTableInfo(type);
  if (!info) throw new Error("Invalid attribute type");

  const [rows] = await pool.query(
    `SELECT COUNT(*) as count FROM product_master WHERE ?? = ? LIMIT 1`,
    [info.idField, id]
  );
  return rows[0].count > 0;
};

const deleteAttribute = async (type, id) => {
  const info = getTableInfo(type);
  if (!info) throw new Error("Invalid attribute type");

  const [result] = await pool.query(`UPDATE ?? SET is_active = 0 WHERE ?? = ?`, [info.table, info.idField, id]);
  return result;
};

const toggleAttributeStatus = async (type, id, isActive) => {
  const info = getTableInfo(type);
  if (!info) throw new Error("Invalid attribute type");

  const [result] = await pool.query(
    `UPDATE ?? SET is_active = ? WHERE ?? = ?`,
    [info.table, isActive ? 1 : 0, info.idField, id]
  );
  return result;
};

module.exports = {
  getTableInfo,
  getAllAttributes,
  getAttributeByName,
  getAttributeById,
  createAttribute,
  updateAttribute,
  checkAttributeUsage,
  deleteAttribute,
  toggleAttributeStatus,
};
