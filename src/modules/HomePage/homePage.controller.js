const ConnectDB = require('../../config/db');

exports.getHeroCMS = async (req, res) => {
  try {
    const [heroRows] = await ConnectDB.query('SELECT * FROM home_hero WHERE hero_id = 1');
    if (heroRows.length === 0) return res.status(404).json({ success: false, message: 'Hero not found' });
    
    const [marqueeRows] = await ConnectDB.query('SELECT * FROM home_hero_marquee WHERE hero_id = 1 ORDER BY item_order ASC');
    
    res.status(200).json({ success: true, hero: heroRows[0], marquee: marqueeRows });
  } catch (error) {
    console.error("Error fetching hero CMS:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.updateHeroCMS = async (req, res) => {
  try {
    const {
      heading, heading_enabled,
      sub_heading, sub_heading_enabled,
      description_line_1, description_line_1_enabled,
      description_line_2, description_line_2_enabled,
      is_enabled, marquee_items
    } = req.body;

    let backgroundImage = req.file ? `/uploads/home/${req.file.filename}` : undefined;

    const updateQuery = `
      UPDATE home_hero SET 
        heading = ?, heading_enabled = ?,
        sub_heading = ?, sub_heading_enabled = ?,
        description_line_1 = ?, description_line_1_enabled = ?,
        description_line_2 = ?, description_line_2_enabled = ?,
        is_enabled = ?
        ${backgroundImage ? ', background_image = ?' : ''}
      WHERE hero_id = 1
    `;
    
    const queryParams = [
      heading, heading_enabled,
      sub_heading, sub_heading_enabled,
      description_line_1, description_line_1_enabled,
      description_line_2, description_line_2_enabled,
      is_enabled
    ];
    if (backgroundImage) queryParams.push(backgroundImage);

    await ConnectDB.execute(updateQuery, queryParams);

    const parsedMarquee = JSON.parse(marquee_items || '[]');
    await ConnectDB.execute('DELETE FROM home_hero_marquee WHERE hero_id = 1');
    
    for (let i = 0; i < parsedMarquee.length; i++) {
      const item = parsedMarquee[i];
      await ConnectDB.execute(
        'INSERT INTO home_hero_marquee (hero_id, marquee_text, item_order, is_enabled) VALUES (?, ?, ?, ?)',
        [1, item.marquee_text, i + 1, item.is_enabled]
      );
    }

    res.status(200).json({ success: true, message: 'Home Hero updated successfully.' });
  } catch (error) {
    console.error("Error updating hero CMS:", error);
    res.status(500).json({ success: false, message: "Server error updating Hero" });
  }
};

exports.getBreathCMS = async (req, res) => {
  try {
    const [breathRows] = await ConnectDB.query('SELECT * FROM home_breath WHERE home_page_id = 1');
    if (breathRows.length === 0) return res.status(404).json({ success: false, message: 'Breath section not found' });
    
    res.status(200).json({ success: true, breath: breathRows[0] });
  } catch (error) {
    console.error("Error fetching breath CMS:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.updateBreathCMS = async (req, res) => {
  try {
    const {
      heading_line_1, heading_line_1_enabled,
      heading_line_2, heading_line_2_enabled,
      heading_highlight, heading_highlight_enabled,
      heading_line_3, heading_line_3_enabled,
      description, description_enabled,
      is_enabled
    } = req.body;

    let image = req.file ? `/uploads/home/${req.file.filename}` : undefined;

    const updateQuery = `
      UPDATE home_breath SET 
        heading_line_1 = ?, heading_line_1_enabled = ?,
        heading_line_2 = ?, heading_line_2_enabled = ?,
        heading_highlight = ?, heading_highlight_enabled = ?,
        heading_line_3 = ?, heading_line_3_enabled = ?,
        description = ?, description_enabled = ?,
        is_enabled = ?
        ${image ? ', image = ?' : ''}
      WHERE home_page_id = 1
    `;
    
    const queryParams = [
      heading_line_1, heading_line_1_enabled,
      heading_line_2, heading_line_2_enabled,
      heading_highlight, heading_highlight_enabled,
      heading_line_3, heading_line_3_enabled,
      description, description_enabled,
      is_enabled
    ];
    if (image) queryParams.push(image);

    await ConnectDB.execute(updateQuery, queryParams);

    res.status(200).json({ success: true, message: 'Home Breath updated successfully.' });
  } catch (error) {
    console.error("Error updating breath CMS:", error);
    res.status(500).json({ success: false, message: "Server error updating Breath section" });
  }
};

exports.getTopPicksCMS = async (req, res) => {
  try {
    const [rows] = await ConnectDB.query('SELECT * FROM home_top_picks WHERE top_picks_id = 1');
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Section not found' });
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error("Error fetching Top Picks CMS:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.updateTopPicksCMS = async (req, res) => {
  try {
    const { section_name, is_enabled } = req.body;
    await ConnectDB.execute(
      'UPDATE home_top_picks SET section_name = ?, is_enabled = ? WHERE top_picks_id = 1',
      [section_name, is_enabled]
    );
    res.status(200).json({ success: true, message: 'Top Picks CMS updated successfully.' });
  } catch (error) {
    console.error("Error updating Top Picks CMS:", error);
    res.status(500).json({ success: false, message: "Server error updating section" });
  }
};

exports.getShopCategoryCMS = async (req, res) => {
  try {
    const [rows] = await ConnectDB.query('SELECT * FROM home_shop_category WHERE shop_category_id = 1');
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Section not found' });
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error("Error fetching Shop Category CMS:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.updateShopCategoryCMS = async (req, res) => {
  try {
    const { section_name, is_enabled } = req.body;
    await ConnectDB.execute(
      'UPDATE home_shop_category SET section_name = ?, is_enabled = ? WHERE shop_category_id = 1',
      [section_name, is_enabled]
    );
    res.status(200).json({ success: true, message: 'Shop Category CMS updated successfully.' });
  } catch (error) {
    console.error("Error updating Shop Category CMS:", error);
    res.status(500).json({ success: false, message: "Server error updating section" });
  }
};

exports.getShopByCMS = async (req, res) => {
  try {
    const [rows] = await ConnectDB.query('SELECT * FROM home_shop_by WHERE shop_by_id = 1');
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Section not found' });
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error("Error fetching Shop By CMS:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.updateShopByCMS = async (req, res) => {
  try {
    const { section_name, is_enabled } = req.body;
    await ConnectDB.execute(
      'UPDATE home_shop_by SET section_name = ?, is_enabled = ? WHERE shop_by_id = 1',
      [section_name, is_enabled]
    );
    res.status(200).json({ success: true, message: 'Shop By CMS updated successfully.' });
  } catch (error) {
    console.error("Error updating Shop By CMS:", error);
    res.status(500).json({ success: false, message: "Server error updating section" });
  }
};

exports.getWhereComfortMeetsCMS = async (req, res) => {
  try {
    const [rows] = await ConnectDB.query('SELECT * FROM home_where_comfort_meets WHERE where_comfort_id = 1');
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Section not found' });
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error("Error fetching Where Comfort Meets CMS:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.updateWhereComfortMeetsCMS = async (req, res) => {
  try {
    const { 
      heading_line_1, heading_line_1_enabled,
      heading_highlight, heading_highlight_enabled,
      heading_line_2, heading_line_2_enabled,
      description, description_enabled,
      is_enabled 
    } = req.body;

    const [existing] = await ConnectDB.query('SELECT image FROM home_where_comfort_meets WHERE where_comfort_id = 1');
    let newImagePath = existing[0]?.image;

    if (req.file) {
      newImagePath = `/uploads/home/${req.file.filename}`;
    }

    await ConnectDB.execute(
      `UPDATE home_where_comfort_meets SET 
        heading_line_1 = ?, heading_line_1_enabled = ?,
        heading_highlight = ?, heading_highlight_enabled = ?,
        heading_line_2 = ?, heading_line_2_enabled = ?,
        description = ?, description_enabled = ?,
        image = ?, is_enabled = ?
       WHERE where_comfort_id = 1`,
      [
        heading_line_1, heading_line_1_enabled,
        heading_highlight, heading_highlight_enabled,
        heading_line_2, heading_line_2_enabled,
        description, description_enabled,
        newImagePath, is_enabled
      ]
    );

    res.status(200).json({ success: true, message: 'Where Comfort Meets CMS updated successfully.' });
  } catch (error) {
    console.error("Error updating Where Comfort Meets CMS:", error);
    res.status(500).json({ success: false, message: "Server error updating section" });
  }
};

exports.getExclusiveSummerCMS = async (req, res) => {
  try {
    const [rows] = await ConnectDB.query('SELECT * FROM home_exclusive_summer_linens WHERE exclusive_summer_id = 1');
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Section not found' });
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error("Error fetching Exclusive Summer CMS:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.updateExclusiveSummerCMS = async (req, res) => {
  try {
    const { section_name, is_enabled } = req.body;
    await ConnectDB.execute(
      'UPDATE home_exclusive_summer_linens SET section_name = ?, is_enabled = ? WHERE exclusive_summer_id = 1',
      [section_name, is_enabled]
    );
    res.status(200).json({ success: true, message: 'Exclusive Summer CMS updated successfully.' });
  } catch (error) {
    console.error("Error updating Exclusive Summer CMS:", error);
    res.status(500).json({ success: false, message: "Server error updating section" });
  }
};

exports.getWhyLinenCMS = async (req, res) => {
  try {
    const [rows] = await ConnectDB.query('SELECT * FROM home_why_linen WHERE why_linen_id = 1');
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Section not found' });
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error("Error fetching Why Linen CMS:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.updateWhyLinenCMS = async (req, res) => {
  try {
    const { 
      section_name,
      feature_1_title, feature_1_description,
      feature_2_title, feature_2_description,
      feature_3_title, feature_3_description,
      is_enabled 
    } = req.body;

    const [existing] = await ConnectDB.query('SELECT background_image FROM home_why_linen WHERE why_linen_id = 1');
    let newImagePath = existing[0]?.background_image;

    if (req.file) {
      newImagePath = `/uploads/home/${req.file.filename}`;
    }

    await ConnectDB.execute(
      `UPDATE home_why_linen SET 
        section_name = ?,
        feature_1_title = ?, feature_1_description = ?,
        feature_2_title = ?, feature_2_description = ?,
        feature_3_title = ?, feature_3_description = ?,
        background_image = ?, is_enabled = ?
       WHERE why_linen_id = 1`,
      [
        section_name,
        feature_1_title, feature_1_description,
        feature_2_title, feature_2_description,
        feature_3_title, feature_3_description,
        newImagePath, is_enabled
      ]
    );

    res.status(200).json({ success: true, message: 'Why Linen CMS updated successfully.' });
  } catch (error) {
    console.error("Error updating Why Linen CMS:", error);
    res.status(500).json({ success: false, message: "Server error updating section" });
  }
};

exports.getWhyFabricLuxureCMS = async (req, res) => {
  try {
    const [rows] = await ConnectDB.query('SELECT * FROM home_why_fabric_luxure WHERE why_fabric_luxure_id = 1');
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Section not found' });
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error("Error fetching Why Fabric Luxure CMS:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.updateWhyFabricLuxureCMS = async (req, res) => {
  try {
    const { 
      section_name,
      content_1, content_1_enabled,
      content_2, content_2_enabled,
      is_enabled 
    } = req.body;

    await ConnectDB.execute(
      `UPDATE home_why_fabric_luxure SET 
        section_name = ?,
        content_1 = ?, content_1_enabled = ?,
        content_2 = ?, content_2_enabled = ?,
        is_enabled = ?
       WHERE why_fabric_luxure_id = 1`,
      [
        section_name,
        content_1, content_1_enabled,
        content_2, content_2_enabled,
        is_enabled
      ]
    );

    res.status(200).json({ success: true, message: 'Why Fabric Luxure CMS updated successfully.' });
  } catch (error) {
    console.error("Error updating Why Fabric Luxure CMS:", error);
    res.status(500).json({ success: false, message: "Server error updating section" });
  }
};

exports.getOurPscCMS = async (req, res) => {
  try {
    const [rows] = await ConnectDB.query('SELECT * FROM home_our_psc WHERE our_psc_id = 1');
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Section not found' });
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error("Error fetching Our PSC CMS:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.updateOurPscCMS = async (req, res) => {
  try {
    const { 
      section_name,
      card_1_title, card_1_enabled,
      card_2_title, card_2_enabled,
      card_3_title, card_3_enabled,
      is_enabled 
    } = req.body;

    const [existing] = await ConnectDB.query('SELECT card_1_image, card_2_image, card_3_image FROM home_our_psc WHERE our_psc_id = 1');
    let card1ImagePath = existing[0]?.card_1_image;
    let card2ImagePath = existing[0]?.card_2_image;
    let card3ImagePath = existing[0]?.card_3_image;

    if (req.files) {
      if (req.files.card_1_image) card1ImagePath = `/uploads/home/${req.files.card_1_image[0].filename}`;
      if (req.files.card_2_image) card2ImagePath = `/uploads/home/${req.files.card_2_image[0].filename}`;
      if (req.files.card_3_image) card3ImagePath = `/uploads/home/${req.files.card_3_image[0].filename}`;
    }

    await ConnectDB.execute(
      `UPDATE home_our_psc SET 
        section_name = ?,
        card_1_title = ?, card_1_image = ?, card_1_enabled = ?,
        card_2_title = ?, card_2_image = ?, card_2_enabled = ?,
        card_3_title = ?, card_3_image = ?, card_3_enabled = ?,
        is_enabled = ?
       WHERE our_psc_id = 1`,
      [
        section_name,
        card_1_title, card1ImagePath, card_1_enabled,
        card_2_title, card2ImagePath, card_2_enabled,
        card_3_title, card3ImagePath, card_3_enabled,
        is_enabled
      ]
    );

    res.status(200).json({ success: true, message: 'Our PSC CMS updated successfully.' });
  } catch (error) {
    console.error("Error updating Our PSC CMS:", error);
    res.status(500).json({ success: false, message: "Server error updating section" });
  }
};

exports.getCustomersSayCMS = async (req, res) => {
  try {
    const [rows] = await ConnectDB.query('SELECT * FROM home_customers_say WHERE customers_say_id = 1');
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Section not found' });
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error("Error fetching Customers Say CMS:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.updateCustomersSayCMS = async (req, res) => {
  try {
    const { 
      section_name,
      is_enabled 
    } = req.body;

    await ConnectDB.execute(
      `UPDATE home_customers_say SET 
        section_name = ?,
        is_enabled = ?
       WHERE customers_say_id = 1`,
      [
        section_name,
        is_enabled
      ]
    );

    res.status(200).json({ success: true, message: 'Customers Say CMS updated successfully.' });
  } catch (error) {
    console.error("Error updating Customers Say CMS:", error);
    res.status(500).json({ success: false, message: "Server error updating section" });
  }
};

exports.getWeBelieveCMS = async (req, res) => {
  try {
    const [rows] = await ConnectDB.query('SELECT * FROM home_we_believe WHERE we_believe_id = 1');
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Section not found' });
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error("Error fetching We Believe CMS:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.updateWeBelieveCMS = async (req, res) => {
  try {
    const { 
      section_name,
      content_1, content_1_enabled,
      content_2, content_2_enabled,
      is_enabled 
    } = req.body;

    await ConnectDB.execute(
      `UPDATE home_we_believe SET 
        section_name = ?,
        content_1 = ?, content_1_enabled = ?,
        content_2 = ?, content_2_enabled = ?,
        is_enabled = ?
       WHERE we_believe_id = 1`,
      [
        section_name,
        content_1, content_1_enabled,
        content_2, content_2_enabled,
        is_enabled
      ]
    );

    res.status(200).json({ success: true, message: 'We Believe CMS updated successfully.' });
  } catch (error) {
    console.error("Error updating We Believe CMS:", error);
    res.status(500).json({ success: false, message: "Server error updating section" });
  }
};

exports.getFaqCMS = async (req, res) => {
  try {
    const [rows] = await ConnectDB.query('SELECT * FROM home_faq WHERE faq_home_id = 1');
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Section not found' });
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error("Error fetching FAQ CMS:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.updateFaqCMS = async (req, res) => {
  try {
    const { 
      section_name,
      is_enabled 
    } = req.body;

    await ConnectDB.execute(
      `UPDATE home_faq SET 
        section_name = ?,
        is_enabled = ?
       WHERE faq_home_id = 1`,
      [
        section_name,
        is_enabled
      ]
    );

    res.status(200).json({ success: true, message: 'FAQ CMS updated successfully.' });
  } catch (error) {
    console.error("Error updating FAQ CMS:", error);
    res.status(500).json({ success: false, message: "Server error updating section" });
  }
};
