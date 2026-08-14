const eventsPageService = require("./eventsPage.service");

const getEventsHero = async (req, res) => {
    try {
        const data = await eventsPageService.getEventsHero();
        if (!data) {
            return res.status(404).json({ success: false, message: "Events Hero configuration not found." });
        }
        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error("Error fetching Events Hero:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

const updateEventsHero = async (req, res) => {
    try {
        const { is_enabled, content_enabled, eyebrow_text, hero_title, hero_description } = req.body;
        
        const existingData = await eventsPageService.getEventsHero();
        if (!existingData) {
            return res.status(404).json({ success: false, message: "Events Hero configuration not found." });
        }

        let hero_image = existingData.hero_image;
        if (req.file) {
            hero_image = `/uploads/events/${req.file.filename}`;
        }

        const data = {
            is_enabled: is_enabled === "true" || is_enabled === "1" || is_enabled === 1 || is_enabled === true ? 1 : 0,
            content_enabled: content_enabled === "true" || content_enabled === "1" || content_enabled === 1 || content_enabled === true ? 1 : 0,
            eyebrow_text,
            hero_title,
            hero_description,
            hero_image
        };

        const result = await eventsPageService.updateEventsHero(data);
        if (result) {
            res.status(200).json({ success: true, message: "Events Hero updated successfully" });
        } else {
            res.status(400).json({ success: false, message: "Failed to update Events Hero" });
        }
    } catch (error) {
        console.error("Error updating Events Hero:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

const getFeaturedEventCMS = async (req, res) => {
    try {
        const data = await eventsPageService.getFeaturedEvent();
        if (!data) {
            return res.status(404).json({ success: false, message: "Featured Event configuration not found." });
        }
        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error("Error fetching Featured Event CMS:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

const updateFeaturedEventCMS = async (req, res) => {
    try {
        const { is_enabled, section_title } = req.body;
        
        const existingData = await eventsPageService.getFeaturedEvent();
        if (!existingData) {
            return res.status(404).json({ success: false, message: "Featured Event configuration not found." });
        }

        const data = {
            is_enabled: is_enabled === "true" || is_enabled === "1" || is_enabled === 1 || is_enabled === true ? 1 : 0,
            section_title: section_title || "FEATURED EVENT"
        };

        const result = await eventsPageService.updateFeaturedEvent(data);
        if (result) {
            res.status(200).json({ success: true, message: "Featured Event section updated successfully" });
        } else {
            res.status(400).json({ success: false, message: "Failed to update Featured Event section" });
        }
    } catch (error) {
        console.error("Error updating Featured Event CMS:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

module.exports = {
    getEventsHero,
    updateEventsHero,
    getFeaturedEventCMS,
    updateFeaturedEventCMS
};
