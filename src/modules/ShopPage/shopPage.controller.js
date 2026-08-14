const ConnectDB = require('../../config/db');

exports.getShopHeroCMS = async (req, res) => {
  try {
    const [rows] = await ConnectDB.query('SELECT * FROM shop_hero WHERE section_key = "shop_hero"');
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Shop hero section not found' });
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error("Error fetching Shop Hero CMS:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.updateShopHeroCMS = async (req, res) => {
  try {
    const { content, content_enabled, is_enabled } = req.body;
    let background_image = req.body.background_image;

    if (req.file) {
      background_image = `/uploads/home/${req.file.filename}`;
    }

    await ConnectDB.execute(
      `UPDATE shop_hero SET 
        background_image = ?,
        content = ?, 
        content_enabled = ?, 
        is_enabled = ?
       WHERE section_key = "shop_hero"`,
      [
        background_image,
        content,
        content_enabled,
        is_enabled
      ]
    );

    res.status(200).json({ success: true, message: 'Shop Hero CMS updated successfully.' });
  } catch (error) {
    console.error("Error updating Shop Hero CMS:", error);
    res.status(500).json({ success: false, message: "Server error updating section" });
  }
};
