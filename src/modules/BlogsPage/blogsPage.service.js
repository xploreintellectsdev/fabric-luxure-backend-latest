const db = require("../../config/db");

const getBlogsHero = async () => {
    const query = `SELECT * FROM blogs_hero WHERE section_key = "blogs_hero" LIMIT 1`;
    const [rows] = await db.execute(query);
    return rows[0] || null;
};

const updateBlogsHero = async (data) => {
    const { is_enabled, eyebrow_text, hero_title, hero_description, background_image } = data;
    const query = `
        UPDATE blogs_hero 
        SET 
            is_enabled = ?, 
            eyebrow_text = ?, 
            hero_title = ?, 
            hero_description = ?, 
            background_image = ?,
            updated_at = NOW()
        WHERE section_key = "blogs_hero"
    `;
    const values = [is_enabled, eyebrow_text, hero_title, hero_description, background_image];
    const [result] = await db.execute(query, values);
    return result.affectedRows > 0;
};

const getLatestArticles = async () => {
    const query = `SELECT * FROM blogs_latest_articles WHERE section_key = "latest_articles" LIMIT 1`;
    const [rows] = await db.execute(query);
    return rows[0] || null;
};

const updateLatestArticles = async (data) => {
    const { is_enabled, section_title } = data;
    const query = `
        UPDATE blogs_latest_articles 
        SET 
            is_enabled = ?, 
            section_title = ?,
            updated_at = NOW()
        WHERE section_key = "latest_articles"
    `;
    const values = [is_enabled, section_title];
    const [result] = await db.execute(query, values);
    return result.affectedRows > 0;
};

const getHeritage = async () => {
    const query = `SELECT * FROM blogs_heritage WHERE section_key = "blogs_heritage" LIMIT 1`;
    const [rows] = await db.execute(query);
    return rows[0] || null;
};

const updateHeritage = async (data) => {
    const { is_enabled, section_title, section_description } = data;
    const query = `
        UPDATE blogs_heritage 
        SET 
            is_enabled = ?, 
            section_title = ?,
            section_description = ?,
            updated_at = NOW()
        WHERE section_key = "blogs_heritage"
    `;
    const values = [is_enabled, section_title, section_description];
    const [result] = await db.execute(query, values);
    return result.affectedRows > 0;
};

module.exports = {
    getBlogsHero,
    updateBlogsHero,
    getLatestArticles,
    updateLatestArticles,
    getHeritage,
    updateHeritage
};
