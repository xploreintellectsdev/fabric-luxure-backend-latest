const db = require('../../config/db');

exports.getFooterSettings = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM footer_settings LIMIT 1');
        if (rows.length === 0) {
            return res.status(404).json({ message: "Footer settings not found" });
        }
        res.status(200).json(rows[0]);
    } catch (err) {
        console.error("Error fetching footer settings:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

exports.updateFooterSettings = async (req, res) => {
    try {
        const {
            facebook_url = "",
            facebook_enabled = 1,
            instagram_url = "",
            instagram_enabled = 1,
            x_url = "",
            x_enabled = 1,
            youtube_url = "",
            youtube_enabled = 1,
            phone_number = "",
            phone_enabled = 1,
            email = "",
            email_enabled = 1,
            address = "",
            address_enabled = 1,
            google_map_url = "",
            google_map_enabled = 1,
            is_enabled = 1,
            footer_description = null
        } = req.body;

        const updateQuery = `
            UPDATE footer_settings SET 
                facebook_url = ?, facebook_enabled = ?,
                instagram_url = ?, instagram_enabled = ?,
                x_url = ?, x_enabled = ?,
                youtube_url = ?, youtube_enabled = ?,
                phone_number = ?, phone_enabled = ?,
                email = ?, email_enabled = ?,
                address = ?, address_enabled = ?,
                google_map_url = ?, google_map_enabled = ?,
                is_enabled = ?, footer_description = ?
            WHERE footer_id = 1
        `;

        const values = [
            facebook_url, facebook_enabled,
            instagram_url, instagram_enabled,
            x_url, x_enabled,
            youtube_url, youtube_enabled,
            phone_number, phone_enabled,
            email, email_enabled,
            address, address_enabled,
            google_map_url, google_map_enabled,
            is_enabled, footer_description
        ];

        const [result] = await db.query(updateQuery, values);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Footer settings record not found" });
        }

        // Return the updated settings row
        const [updatedRows] = await db.query('SELECT * FROM footer_settings WHERE footer_id = 1');
        res.status(200).json(updatedRows[0]);
    } catch (err) {
        console.error("Error updating footer settings:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
