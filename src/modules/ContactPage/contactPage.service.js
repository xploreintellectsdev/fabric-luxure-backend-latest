const pool = require('../../config/db');

const getHeroConfig = async () => {
    const [rows] = await pool.query('SELECT * FROM contact_page_hero LIMIT 1');
    return rows[0] || null;
};

const updateHeroConfig = async (data, background_image_path) => {
    const { section_enabled, hero_content, hero_content_enabled } = data;

    const [rows] = await pool.query('SELECT id FROM contact_page_hero LIMIT 1');
    
    let query = '';
    let params = [];

    if (rows.length > 0) {
        if (background_image_path) {
            query = 'UPDATE contact_page_hero SET section_enabled = ?, background_image = ?, hero_content = ?, hero_content_enabled = ? WHERE id = ?';
            params = [section_enabled, background_image_path, hero_content, hero_content_enabled, rows[0].id];
        } else {
            query = 'UPDATE contact_page_hero SET section_enabled = ?, hero_content = ?, hero_content_enabled = ? WHERE id = ?';
            params = [section_enabled, hero_content, hero_content_enabled, rows[0].id];
        }
    } else {
        query = 'INSERT INTO contact_page_hero (section_enabled, background_image, hero_content, hero_content_enabled) VALUES (?, ?, ?, ?)';
        params = [section_enabled, background_image_path, hero_content, hero_content_enabled];
    }

    const [result] = await pool.query(query, params);
    return result;
};

const getContactInfo = async () => {
    const [rows] = await pool.query('SELECT * FROM contact_information LIMIT 1');
    return rows[0] || null;
};

const updateContactInfo = async (data) => {
    const { is_enabled, small_heading, main_heading, phone_number, email, address, map_url } = data;

    const [rows] = await pool.query('SELECT contact_info_id FROM contact_information LIMIT 1');
    
    let query = '';
    let params = [];

    if (rows.length > 0) {
        query = 'UPDATE contact_information SET is_enabled = ?, small_heading = ?, main_heading = ?, phone_number = ?, email = ?, address = ?, map_url = ? WHERE contact_info_id = ?';
        params = [is_enabled, small_heading, main_heading, phone_number, email, address, map_url, rows[0].contact_info_id];
    } else {
        query = 'INSERT INTO contact_information (is_enabled, small_heading, main_heading, phone_number, email, address, map_url) VALUES (?, ?, ?, ?, ?, ?, ?)';
        params = [is_enabled, small_heading, main_heading, phone_number, email, address, map_url];
    }

    const [result] = await pool.query(query, params);
    return result;
};

const getFormConfig = async () => {
    const [rows] = await pool.query('SELECT * FROM contact_form_section LIMIT 1');
    return rows[0] || null;
};

const updateFormConfig = async (data, section_image) => {
    const { is_enabled, section_title } = data;

    const [rows] = await pool.query('SELECT section_id FROM contact_form_section LIMIT 1');
    
    let query = '';
    let params = [];

    if (rows.length > 0) {
        if (section_image) {
            query = 'UPDATE contact_form_section SET is_enabled = ?, section_title = ?, section_image = ? WHERE section_id = ?';
            params = [is_enabled, section_title, section_image, rows[0].section_id];
        } else {
            query = 'UPDATE contact_form_section SET is_enabled = ?, section_title = ? WHERE section_id = ?';
            params = [is_enabled, section_title, rows[0].section_id];
        }
    } else {
        query = 'INSERT INTO contact_form_section (is_enabled, section_title, section_image) VALUES (?, ?, ?)';
        params = [is_enabled, section_title, section_image];
    }

    const [result] = await pool.query(query, params);
    return result;
};

const getConversationConfig = async () => {
    const [rows] = await pool.query('SELECT * FROM contact_conversation_section LIMIT 1');
    return rows[0] || null;
};

const updateConversationConfig = async (data) => {
    const { is_enabled, section_title, section_content } = data;

    const [rows] = await pool.query('SELECT section_id FROM contact_conversation_section LIMIT 1');
    
    let query = '';
    let params = [];

    if (rows.length > 0) {
        query = 'UPDATE contact_conversation_section SET is_enabled = ?, section_title = ?, section_content = ? WHERE section_id = ?';
        params = [is_enabled, section_title, section_content, rows[0].section_id];
    } else {
        query = 'INSERT INTO contact_conversation_section (is_enabled, section_title, section_content) VALUES (?, ?, ?)';
        params = [is_enabled, section_title, section_content];
    }

    const [result] = await pool.query(query, params);
    return result;
};

module.exports = {
    getHeroConfig,
    updateHeroConfig,
    getContactInfo,
    updateContactInfo,
    getFormConfig,
    updateFormConfig,
    getConversationConfig,
    updateConversationConfig
};
