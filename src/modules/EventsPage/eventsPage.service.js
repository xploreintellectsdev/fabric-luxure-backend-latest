const db = require("../../config/db");

const getEventsHero = async () => {
    const query = `SELECT * FROM events_hero WHERE section_key = "events_hero" LIMIT 1`;
    const [rows] = await db.execute(query);
    return rows[0] || null;
};

const updateEventsHero = async (data) => {
    const {
        is_enabled,
        content_enabled,
        eyebrow_text,
        hero_title,
        hero_description,
        hero_image
    } = data;

    const query = `
        UPDATE events_hero 
        SET 
            is_enabled = ?, 
            content_enabled = ?, 
            eyebrow_text = ?, 
            hero_title = ?, 
            hero_description = ?, 
            hero_image = ?,
            updated_at = NOW()
        WHERE section_key = "events_hero"
    `;

    const values = [
        is_enabled,
        content_enabled,
        eyebrow_text,
        hero_title,
        hero_description,
        hero_image
    ];

    const [result] = await db.execute(query, values);
    return result.affectedRows > 0;
};

const getFeaturedEvent = async () => {
    const query = `SELECT * FROM events_featured WHERE section_key = "featured_event" LIMIT 1`;
    const [rows] = await db.execute(query);
    return rows[0] || null;
};

const updateFeaturedEvent = async (data) => {
    const { is_enabled, section_title } = data;
    const query = `
        UPDATE events_featured 
        SET 
            is_enabled = ?, 
            section_title = ?,
            updated_at = NOW()
        WHERE section_key = "featured_event"
    `;
    const values = [is_enabled, section_title];
    const [result] = await db.execute(query, values);
    return result.affectedRows > 0;
};

module.exports = {
    getEventsHero,
    updateEventsHero,
    getFeaturedEvent,
    updateFeaturedEvent
};
