const path = require("path");
const fs = require("fs");
const monogramService = require("./monogram.service");

// ========================
// Helper to safely parse boolean and numbers
// ========================
const parseBoolean = (val, defaultVal = true) => {
    if (val === undefined || val === null) return defaultVal;
    if (typeof val === 'string') return val.trim().toLowerCase() === 'true' || val === '1';
    return Boolean(val);
};

const parseNumber = (val, defaultVal = 0) => {
    const num = parseFloat(val);
    return isNaN(num) ? defaultVal : num;
};

// ========================
// Placements
// ========================

const getAdminPlacements = async (req, res) => {
    try {
        const { pro_type_id } = req.query;
        const data = await monogramService.getPlacements(false, pro_type_id);
        res.status(200).json({ success: true, message: "Placements fetched successfully.", data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const getPublicPlacements = async (req, res) => {
    try {
        const { pro_type_id } = req.query;
        const data = await monogramService.getPlacements(true, pro_type_id);
        res.status(200).json({ success: true, message: "Placements fetched successfully.", data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const getPlacementById = async (req, res) => {
    try {
        const data = await monogramService.getPlacementById(req.params.id);
        res.status(200).json({ success: true, message: "Placement fetched successfully.", data });
    } catch (error) {
        res.status(404).json({ success: false, message: error.message });
    }
};

const createPlacement = async (req, res) => {
    try {
        const { placement_name, extra_price, is_active, pro_type_id } = req.body;
        const nameTrimmed = placement_name?.trim();

        if (!nameTrimmed) {
            return res.status(400).json({ success: false, message: "Placement Name required" });
        }
        if (!req.file) {
            return res.status(400).json({ success: false, message: "Image required" });
        }

        const data = await monogramService.createPlacement({
            placement_name: nameTrimmed,
            placement_image: `/uploads/monogram_placements/${req.file.filename}`,
            extra_price: parseNumber(extra_price, 0),
            is_active: parseBoolean(is_active),
            pro_type_id: pro_type_id
        });

        res.status(201).json({ success: true, message: "Placement created successfully.", data });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

const updatePlacement = async (req, res) => {
    try {
        const { placement_name, extra_price, is_active, pro_type_id } = req.body;
        const nameTrimmed = placement_name?.trim();

        if (!nameTrimmed) {
            return res.status(400).json({ success: false, message: "Placement Name required" });
        }

        const updateData = {
            placement_name: nameTrimmed,
            placement_image: req.file ? `/uploads/monogram_placements/${req.file.filename}` : null, // Service retains old if null
            extra_price: parseNumber(extra_price, 0),
            is_active: parseBoolean(is_active)
        };
        if (pro_type_id !== undefined) updateData.pro_type_id = pro_type_id;

        const data = await monogramService.updatePlacement(req.params.id, updateData);

        res.status(200).json({ success: true, message: "Placement updated successfully.", data });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

const deletePlacement = async (req, res) => {
    try {
        await monogramService.deletePlacement(req.params.id);
        res.status(200).json({ success: true, message: "Placement deleted successfully." });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// ========================
// Colors
// ========================

const getAdminColors = async (req, res) => {
    try {
        const { pro_type_id } = req.query;
        const data = await monogramService.getColors(false, pro_type_id);
        res.status(200).json({ success: true, message: "Colors fetched successfully.", data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const getPublicColors = async (req, res) => {
    try {
        const { pro_type_id } = req.query;
        const data = await monogramService.getColors(true, pro_type_id);
        res.status(200).json({ success: true, message: "Colors fetched successfully.", data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const getColorById = async (req, res) => {
    try {
        const data = await monogramService.getColorById(req.params.id);
        res.status(200).json({ success: true, message: "Color fetched successfully.", data });
    } catch (error) {
        res.status(404).json({ success: false, message: error.message });
    }
};

const createColor = async (req, res) => {
    try {
        const { color_name, is_active, pro_type_id } = req.body;
        const nameTrimmed = color_name?.trim();

        if (!nameTrimmed) {
            return res.status(400).json({ success: false, message: "Color Name required" });
        }
        if (!req.file) {
            return res.status(400).json({ success: false, message: "Image required" });
        }

        const data = await monogramService.createColor({
            color_name: nameTrimmed,
            color_image: `/uploads/monogram_colors/${req.file.filename}`,
            is_active: parseBoolean(is_active),
            pro_type_id: pro_type_id
        });

        res.status(201).json({ success: true, message: "Color created successfully.", data });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

const updateColor = async (req, res) => {
    try {
        const { color_name, is_active, pro_type_id } = req.body;
        const nameTrimmed = color_name?.trim();

        if (!nameTrimmed) {
            return res.status(400).json({ success: false, message: "Color Name required" });
        }

        const updateData = {
            color_name: nameTrimmed,
            color_image: req.file ? `/uploads/monogram_colors/${req.file.filename}` : null, // Service retains old if null
            is_active: parseBoolean(is_active)
        };
        if (pro_type_id !== undefined) updateData.pro_type_id = pro_type_id;

        const data = await monogramService.updateColor(req.params.id, updateData);

        res.status(200).json({ success: true, message: "Color updated successfully.", data });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

const deleteColor = async (req, res) => {
    try {
        await monogramService.deleteColor(req.params.id);
        res.status(200).json({ success: true, message: "Color deleted successfully." });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// ========================
// Fonts
// ========================

const getAdminFonts = async (req, res) => {
    try {
        const { pro_type_id } = req.query;
        const data = await monogramService.getFonts(false, pro_type_id);
        res.status(200).json({ success: true, message: "Fonts fetched successfully.", data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const getPublicFonts = async (req, res) => {
    try {
        const { pro_type_id } = req.query;
        const data = await monogramService.getFonts(true, pro_type_id);
        res.status(200).json({ success: true, message: "Fonts fetched successfully.", data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const getFontById = async (req, res) => {
    try {
        const data = await monogramService.getFontById(req.params.id);
        res.status(200).json({ success: true, message: "Font fetched successfully.", data });
    } catch (error) {
        res.status(404).json({ success: false, message: error.message });
    }
};

const createFont = async (req, res) => {
    try {
        const { font_name, is_active, pro_type_id } = req.body;
        const nameTrimmed = font_name?.trim();

        if (!nameTrimmed) {
            return res.status(400).json({ success: false, message: "Font Name required" });
        }
        if (!req.file) {
            return res.status(400).json({ success: false, message: "Preview Image required" });
        }

        const data = await monogramService.createFont({
            font_name: nameTrimmed,
            font_preview_image: `/uploads/monogram_fonts/${req.file.filename}`,
            is_active: parseBoolean(is_active),
            pro_type_id: pro_type_id
        });

        res.status(201).json({ success: true, message: "Font created successfully.", data });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

const updateFont = async (req, res) => {
    try {
        const { font_name, is_active, pro_type_id } = req.body;
        const nameTrimmed = font_name?.trim();

        if (!nameTrimmed) {
            return res.status(400).json({ success: false, message: "Font Name required" });
        }

        const updateData = {
            font_name: nameTrimmed,
            font_preview_image: req.file ? `/uploads/monogram_fonts/${req.file.filename}` : null, // Service retains old if null
            is_active: parseBoolean(is_active)
        };
        if (pro_type_id !== undefined) updateData.pro_type_id = pro_type_id;

        const data = await monogramService.updateFont(req.params.id, updateData);

        res.status(200).json({ success: true, message: "Font updated successfully.", data });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

const deleteFont = async (req, res) => {
    try {
        await monogramService.deleteFont(req.params.id);
        res.status(200).json({ success: true, message: "Font deleted successfully." });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// ========================
// Custom Monogram Settings
// ========================

const getCustomMonogramSettings = async (req, res) => {
    try {
        const data = await monogramService.getCustomMonogramSettings();
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const updateCustomMonogramSettings = async (req, res) => {
    try {
        const { setting_name, upload_price, allowed_file_types, max_file_size_mb, description, is_active } = req.body;
        
        const updateData = {
            setting_name,
            upload_price: parseNumber(upload_price),
            allowed_file_types, // Expected to be string like "PNG,JPG,JPEG,PDF"
            max_file_size_mb: parseNumber(max_file_size_mb),
            description,
            is_active: parseBoolean(is_active) ? 1 : 0
        };

        const data = await monogramService.updateCustomMonogramSettings(req.params.id, updateData);
        res.status(200).json({ success: true, message: "Custom Monogram Settings Updated Successfully.", data });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

const uploadCustomMonogram = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No file uploaded." });
        }

        // Fetch settings for validation
        const settings = await monogramService.getCustomMonogramSettings();
        if (!settings || !settings.is_active) {
            // Delete the file since upload is not allowed
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ success: false, message: "Custom monogram upload is currently disabled." });
        }

        const maxSizeBytes = settings.max_file_size_mb * 1024 * 1024;
        if (req.file.size > maxSizeBytes) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ success: false, message: `File size exceeds the maximum limit of ${settings.max_file_size_mb} MB.` });
        }

        const ext = path.extname(req.file.originalname).substring(1).toUpperCase();
        const allowedTypes = settings.allowed_file_types.split(",");
        
        // Very basic mime check based on ext
        const mimeTypes = {
            'PNG': 'image/png',
            'JPG': 'image/jpeg',
            'JPEG': 'image/jpeg',
            'PDF': 'application/pdf',
            'SVG': 'image/svg+xml',
            'AI': 'application/postscript',
            'EPS': 'application/postscript'
        };

        if (!allowedTypes.includes(ext) || (mimeTypes[ext] && !req.file.mimetype.includes(mimeTypes[ext].split('/')[0]))) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ success: false, message: "Unsupported file format." });
        }

        const file_url = `/uploads/custom_monograms/${req.file.filename}`;
        
        res.status(200).json({
            success: true,
            file_url,
            file_type: ext
        });

    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    // Placements
    getAdminPlacements,
    getPublicPlacements,
    getPlacementById,
    createPlacement,
    updatePlacement,
    deletePlacement,
    // Colors
    getAdminColors,
    getPublicColors,
    getColorById,
    createColor,
    updateColor,
    deleteColor,
    // Fonts
    getAdminFonts,
    getPublicFonts,
    getFontById,
    createFont,
    updateFont,
    deleteFont,
    // Custom Monogram Settings
    getCustomMonogramSettings,
    updateCustomMonogramSettings,
    uploadCustomMonogram,
};
