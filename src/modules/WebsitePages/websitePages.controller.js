const ConnectDB = require('../../config/db');

// Public API
exports.getWebsitePages = async (req, res) => {
  try {
    const [rows] = await ConnectDB.query(
      `SELECT * FROM website_pages WHERE is_enabled = 1 ORDER BY menu_order ASC`
    );
    res.status(200).json(rows);
  } catch (error) {
    console.error("Error fetching website pages:", error);
    res.status(500).json({ message: "Server error fetching website pages" });
  }
};

// Admin APIs
exports.getAllPagesForAdmin = async (req, res) => {
  try {
    const [rows] = await ConnectDB.query(
      `SELECT * FROM website_pages ORDER BY menu_order ASC`
    );
    res.status(200).json(rows);
  } catch (error) {
    console.error("Error fetching all website pages for admin:", error);
    res.status(500).json({ message: "Server error fetching pages" });
  }
};

exports.toggleStatus = async (req, res) => {
  const { id } = req.params;
  const { is_enabled } = req.body;
  try {
    await ConnectDB.query(
      `UPDATE website_pages SET is_enabled = ?, updated_at = NOW() WHERE page_id = ?`,
      [is_enabled ? 1 : 0, id]
    );
    res.status(200).json({ message: "Page status updated successfully" });
  } catch (error) {
    console.error("Error updating page status:", error);
    res.status(500).json({ message: "Server error updating status" });
  }
};

exports.toggleNavbar = async (req, res) => {
  const { id } = req.params;
  const { show_in_navbar } = req.body;
  try {
    await ConnectDB.query(
      `UPDATE website_pages SET show_in_navbar = ?, updated_at = NOW() WHERE page_id = ?`,
      [show_in_navbar ? 1 : 0, id]
    );
    res.status(200).json({ message: "Navbar visibility updated successfully" });
  } catch (error) {
    console.error("Error updating navbar visibility:", error);
    res.status(500).json({ message: "Server error updating navbar visibility" });
  }
};

exports.toggleFooter = async (req, res) => {
  const { id } = req.params;
  const { show_in_footer } = req.body;
  try {
    await ConnectDB.query(
      `UPDATE website_pages SET show_in_footer = ?, updated_at = NOW() WHERE page_id = ?`,
      [show_in_footer ? 1 : 0, id]
    );
    res.status(200).json({ message: "Footer visibility updated successfully" });
  } catch (error) {
    console.error("Error updating footer visibility:", error);
    res.status(500).json({ message: "Server error updating footer visibility" });
  }
};

exports.reorderPages = async (req, res) => {
  const { orderedIds } = req.body;
  // orderedIds is an array of page_ids in their new order
  if (!orderedIds || !Array.isArray(orderedIds)) {
    return res.status(400).json({ message: "Invalid payload" });
  }
  
  const connection = await ConnectDB.getConnection();
  try {
    await connection.beginTransaction();
    for (let i = 0; i < orderedIds.length; i++) {
      const pageId = orderedIds[i];
      // menu_order is typically 1-indexed
      await connection.query(
        `UPDATE website_pages SET menu_order = ?, updated_at = NOW() WHERE page_id = ?`,
        [i + 1, pageId]
      );
    }
    await connection.commit();
    res.status(200).json({ message: "Order updated successfully" });
  } catch (error) {
    await connection.rollback();
    console.error("Error reordering pages:", error);
    res.status(500).json({ message: "Server error reordering pages" });
  } finally {
    connection.release();
  }
};
