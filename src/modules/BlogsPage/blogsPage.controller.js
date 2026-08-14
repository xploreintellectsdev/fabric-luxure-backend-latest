const blogsPageService = require("./blogsPage.service");

const getBlogsHero = async (req, res) => {
    try {
        const data = await blogsPageService.getBlogsHero();
        if (!data) {
            return res.status(404).json({ success: false, message: "Blogs Hero configuration not found." });
        }
        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error("Error fetching Blogs Hero:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

const updateBlogsHero = async (req, res) => {
    try {
        const { is_enabled, eyebrow_text, hero_title, hero_description } = req.body;
        
        const existingData = await blogsPageService.getBlogsHero();
        if (!existingData) {
            return res.status(404).json({ success: false, message: "Blogs Hero configuration not found." });
        }

        let background_image = existingData.background_image;
        if (req.file) {
            background_image = `/uploads/blogs/${req.file.filename}`;
        }

        const data = {
            is_enabled: is_enabled === "true" || is_enabled === "1" || is_enabled === 1 || is_enabled === true ? 1 : 0,
            eyebrow_text,
            hero_title,
            hero_description,
            background_image
        };

        const result = await blogsPageService.updateBlogsHero(data);
        if (result) {
            res.status(200).json({ success: true, message: "Blogs Hero updated successfully" });
        } else {
            res.status(400).json({ success: false, message: "Failed to update Blogs Hero" });
        }
    } catch (error) {
        console.error("Error updating Blogs Hero:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

const getLatestArticles = async (req, res) => {
    try {
        const data = await blogsPageService.getLatestArticles();
        if (!data) {
            return res.status(404).json({ success: false, message: "Latest Articles configuration not found." });
        }
        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error("Error fetching Latest Articles:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

const updateLatestArticles = async (req, res) => {
    try {
        const { is_enabled, section_title } = req.body;
        
        const existingData = await blogsPageService.getLatestArticles();
        if (!existingData) {
            return res.status(404).json({ success: false, message: "Latest Articles configuration not found." });
        }

        const data = {
            is_enabled: is_enabled === "true" || is_enabled === "1" || is_enabled === 1 || is_enabled === true ? 1 : 0,
            section_title: section_title || "Latest Articles"
        };

        const result = await blogsPageService.updateLatestArticles(data);
        if (result) {
            res.status(200).json({ success: true, message: "Latest Articles updated successfully" });
        } else {
            res.status(400).json({ success: false, message: "Failed to update Latest Articles" });
        }
    } catch (error) {
        console.error("Error updating Latest Articles:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

const getHeritage = async (req, res) => {
    try {
        const data = await blogsPageService.getHeritage();
        if (!data) {
            return res.status(404).json({ success: false, message: "Heritage configuration not found." });
        }
        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error("Error fetching Heritage:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

const updateHeritage = async (req, res) => {
    try {
        const { is_enabled, section_title, section_description } = req.body;
        
        const existingData = await blogsPageService.getHeritage();
        if (!existingData) {
            return res.status(404).json({ success: false, message: "Heritage configuration not found." });
        }

        const data = {
            is_enabled: is_enabled === "true" || is_enabled === "1" || is_enabled === 1 || is_enabled === true ? 1 : 0,
            section_title: section_title || "Discover Our Heritage",
            section_description: section_description || ""
        };

        const result = await blogsPageService.updateHeritage(data);
        if (result) {
            res.status(200).json({ success: true, message: "Heritage updated successfully" });
        } else {
            res.status(400).json({ success: false, message: "Failed to update Heritage" });
        }
    } catch (error) {
        console.error("Error updating Heritage:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

module.exports = {
    getBlogsHero,
    updateBlogsHero,
    getLatestArticles,
    updateLatestArticles,
    getHeritage,
    updateHeritage
};
