const ConnectDB = require('../../config/db');

// --- PUBLIC APIS ---

// Fetch all active policy pages (metadata)
exports.getPolicies = async (req, res) => {
  try {
    const [rows] = await ConnectDB.query(
      `SELECT * FROM policy_pages WHERE is_active = 1 ORDER BY page_id ASC`
    );
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error("Error fetching policies:", error);
    res.status(500).json({ success: false, message: "Server error fetching policies" });
  }
};

// Fetch a single policy page with all its active sections
exports.getPolicyByPageKey = async (req, res) => {
  const { page_key } = req.params;
  try {
    const [pageRows] = await ConnectDB.query(
      `SELECT * FROM policy_pages WHERE page_key = ? AND is_active = 1`,
      [page_key]
    );

    if (pageRows.length === 0) {
      return res.status(404).json({ success: false, message: "Policy page not found or inactive" });
    }

    const page = pageRows[0];
    const [sectionRows] = await ConnectDB.query(
      `SELECT * FROM policy_sections 
       WHERE page_id = ? AND is_active = 1 AND deleted_at IS NULL 
       ORDER BY order_no ASC`,
      [page.page_id]
    );

    res.status(200).json({
      success: true,
      data: {
        ...page,
        sections: sectionRows
      }
    });
  } catch (error) {
    console.error(`Error fetching policy '${page_key}':`, error);
    res.status(500).json({ success: false, message: "Server error fetching policy details" });
  }
};


// --- ADMIN APIS ---

// Fetch all policy pages for Admin
exports.adminGetPolicies = async (req, res) => {
  try {
    const [rows] = await ConnectDB.query(
      `SELECT * FROM policy_pages ORDER BY page_id ASC`
    );
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error("Error fetching policies for admin:", error);
    res.status(500).json({ success: false, message: "Server error fetching admin policies" });
  }
};

// Fetch single policy with all sections (including inactive ones) for Admin
exports.adminGetPolicyByPageKey = async (req, res) => {
  const { page_key } = req.params;
  try {
    const [pageRows] = await ConnectDB.query(
      `SELECT * FROM policy_pages WHERE page_key = ?`,
      [page_key]
    );

    if (pageRows.length === 0) {
      return res.status(404).json({ success: false, message: "Policy page not found" });
    }

    const page = pageRows[0];
    const [sectionRows] = await ConnectDB.query(
      `SELECT * FROM policy_sections 
       WHERE page_id = ? AND deleted_at IS NULL 
       ORDER BY order_no ASC`,
      [page.page_id]
    );

    res.status(200).json({
      success: true,
      data: {
        ...page,
        sections: sectionRows
      }
    });
  } catch (error) {
    console.error(`Error fetching admin policy '${page_key}':`, error);
    res.status(500).json({ success: false, message: "Server error fetching admin policy details" });
  }
};

// Update policy page-level settings
exports.adminUpdatePolicyPage = async (req, res) => {
  const { page_id } = req.params;
  const { 
    hero_eyebrow, hero_title, hero_subtitle, intro_note, is_active,
    contact_email, contact_phone, grievance_address, grievance_address_link,
    need_help_description
  } = req.body;

  try {
    await ConnectDB.query(
      `UPDATE policy_pages 
       SET hero_eyebrow = ?, hero_title = ?, hero_subtitle = ?, intro_note = ?, is_active = ?, 
           contact_email = ?, contact_phone = ?, grievance_address = ?, grievance_address_link = ?, 
           need_help_description = ?, updated_at = NOW() 
       WHERE page_id = ?`,
      [
        hero_eyebrow, hero_title, hero_subtitle, intro_note, 
        is_active === undefined ? 1 : (is_active ? 1 : 0),
        contact_email || null, contact_phone || null,
        grievance_address || null, grievance_address_link || null,
        need_help_description || null,
        page_id
      ]
    );

    res.status(200).json({ success: true, message: "Policy page updated successfully" });
  } catch (error) {
    console.error(`Error updating policy page ID ${page_id}:`, error);
    res.status(500).json({ success: false, message: "Server error updating policy page" });
  }
};

// Create a new section inside a policy page
exports.adminCreatePolicySection = async (req, res) => {
  const { page_id } = req.params;
  const { icon, title, content, contact_email, contact_phone } = req.body;

  try {
    // Determine next order number
    const [maxRows] = await ConnectDB.query(
      `SELECT COALESCE(MAX(order_no), 0) as max_order FROM policy_sections WHERE page_id = ? AND deleted_at IS NULL`,
      [page_id]
    );
    const nextOrder = maxRows[0].max_order + 1;

    const [result] = await ConnectDB.query(
      `INSERT INTO policy_sections 
       (page_id, icon, title, content, contact_email, contact_phone, order_no, is_active) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [page_id, icon || null, title || '', content || '', contact_email || null, contact_phone || null, nextOrder]
    );

    res.status(201).json({
      success: true,
      message: "Section created successfully",
      data: {
        section_id: result.insertId,
        page_id: parseInt(page_id),
        icon,
        title,
        content,
        contact_email,
        contact_phone,
        order_no: nextOrder,
        is_active: 1
      }
    });
  } catch (error) {
    console.error(`Error creating section for page ID ${page_id}:`, error);
    res.status(500).json({ success: false, message: "Server error creating section" });
  }
};

// Update an existing policy section
exports.adminUpdatePolicySection = async (req, res) => {
  const { section_id } = req.params;
  const { icon, title, content, contact_email, contact_phone, is_active, order_no } = req.body;

  try {
    // Fetch current section first to do partial updates
    const [current] = await ConnectDB.query(`SELECT * FROM policy_sections WHERE section_id = ?`, [section_id]);
    if (current.length === 0) {
      return res.status(404).json({ success: false, message: "Section not found" });
    }
    const curr = current[0];

    await ConnectDB.query(
      `UPDATE policy_sections 
       SET icon = ?, title = ?, content = ?, contact_email = ?, contact_phone = ?, is_active = ?, order_no = ?, updated_at = NOW() 
       WHERE section_id = ?`,
      [
        icon !== undefined ? icon : curr.icon,
        title !== undefined ? title : curr.title,
        content !== undefined ? content : curr.content,
        contact_email !== undefined ? contact_email : curr.contact_email,
        contact_phone !== undefined ? contact_phone : curr.contact_phone,
        is_active !== undefined ? (is_active ? 1 : 0) : curr.is_active,
        order_no !== undefined ? order_no : curr.order_no,
        section_id
      ]
    );

    res.status(200).json({ success: true, message: "Section updated successfully" });
  } catch (error) {
    console.error(`Error updating section ID ${section_id}:`, error);
    res.status(500).json({ success: false, message: "Server error updating section" });
  }
};

// Soft delete a policy section
exports.adminDeletePolicySection = async (req, res) => {
  const { section_id } = req.params;

  try {
    await ConnectDB.query(
      `UPDATE policy_sections SET deleted_at = NOW() WHERE section_id = ?`,
      [section_id]
    );
    res.status(200).json({ success: true, message: "Section deleted successfully" });
  } catch (error) {
    console.error(`Error deleting section ID ${section_id}:`, error);
    res.status(500).json({ success: false, message: "Server error deleting section" });
  }
};

// Reorder sections in a single transaction
exports.adminReorderSections = async (req, res) => {
  const { orderedIds } = req.body; // Array of section_ids in new order
  if (!orderedIds || !Array.isArray(orderedIds)) {
    return res.status(400).json({ success: false, message: "Invalid payload: orderedIds array required" });
  }

  const connection = await ConnectDB.getConnection();
  try {
    await connection.beginTransaction();
    for (let i = 0; i < orderedIds.length; i++) {
      const sectionId = orderedIds[i];
      await connection.query(
        `UPDATE policy_sections SET order_no = ?, updated_at = NOW() WHERE section_id = ?`,
        [i + 1, sectionId]
      );
    }
    await connection.commit();
    res.status(200).json({ success: true, message: "Sections reordered successfully" });
  } catch (error) {
    await connection.rollback();
    console.error("Error reordering sections:", error);
    res.status(500).json({ success: false, message: "Server error reordering sections" });
  } finally {
    connection.release();
  }
};
