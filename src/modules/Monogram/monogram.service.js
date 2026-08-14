const monogramModel = require("./monogram.model");

// ========================
// Placements
// ========================

const getPlacements = async (activeOnly = false, proTypeId = null) => {
    return await monogramModel.getPlacements(activeOnly, proTypeId);
};

const getPlacementById = async (id) => {
    const placement = await monogramModel.getPlacementById(id);
    if (!placement) throw new Error("Placement not found");
    return placement;
};

const createPlacement = async (data) => {
    const existing = await monogramModel.getPlacementByName(data.placement_name);
    if (existing) throw new Error("Placement name already exists");

    if (data.extra_price < 0) throw new Error("Price cannot be negative");

    const newId = await monogramModel.createPlacement(data);
    return await getPlacementById(newId);
};

const updatePlacement = async (id, data) => {
    const existingName = await monogramModel.getPlacementByName(data.placement_name);
    if (existingName && existingName.placement_id !== parseInt(id)) {
        throw new Error("Placement name already exists");
    }

    if (data.extra_price < 0) throw new Error("Price cannot be negative");

    const current = await getPlacementById(id);
    
    // If no new image, keep the existing one
    const updatedData = {
        ...data,
        placement_image: data.placement_image || current.placement_image
    };

    await monogramModel.updatePlacement(id, updatedData);
    return await getPlacementById(id);
};

const deletePlacement = async (id) => {
    // Ensure exists
    await getPlacementById(id);
    await monogramModel.deletePlacement(id);
    return true;
};

// ========================
// Colors
// ========================

const getColors = async (activeOnly = false, proTypeId = null) => {
    return await monogramModel.getColors(activeOnly, proTypeId);
};

const getColorById = async (id) => {
    const color = await monogramModel.getColorById(id);
    if (!color) throw new Error("Color not found");
    return color;
};

const createColor = async (data) => {
    const existing = await monogramModel.getColorByName(data.color_name);
    if (existing) throw new Error("Color name already exists");

    const newId = await monogramModel.createColor(data);
    return await getColorById(newId);
};

const updateColor = async (id, data) => {
    const existingName = await monogramModel.getColorByName(data.color_name);
    if (existingName && existingName.color_id !== parseInt(id)) {
        throw new Error("Color name already exists");
    }

    const current = await getColorById(id);
    
    // If no new image, keep the existing one
    const updatedData = {
        ...data,
        color_image: data.color_image || current.color_image
    };

    await monogramModel.updateColor(id, updatedData);
    return await getColorById(id);
};

const deleteColor = async (id) => {
    await getColorById(id);
    await monogramModel.deleteColor(id);
    return true;
};

// ========================
// Fonts
// ========================

const getFonts = async (activeOnly = false, proTypeId = null) => {
    return await monogramModel.getFonts(activeOnly, proTypeId);
};

const getFontById = async (id) => {
    const font = await monogramModel.getFontById(id);
    if (!font) throw new Error("Font not found");
    return font;
};

const createFont = async (data) => {
    const existing = await monogramModel.getFontByName(data.font_name);
    if (existing) throw new Error("Font name already exists");

    const newId = await monogramModel.createFont(data);
    return await getFontById(newId);
};

const updateFont = async (id, data) => {
    const existingName = await monogramModel.getFontByName(data.font_name);
    if (existingName && existingName.font_id !== parseInt(id)) {
        throw new Error("Font name already exists");
    }

    const current = await getFontById(id);
    
    // If no new image, keep the existing one
    const updatedData = {
        ...data,
        font_preview_image: data.font_preview_image || current.font_preview_image
    };

    await monogramModel.updateFont(id, updatedData);
    return await getFontById(id);
};

const deleteFont = async (id) => {
    await getFontById(id);
    await monogramModel.deleteFont(id);
    return true;
};

// ========================
// Custom Monogram Settings
// ========================

const getCustomMonogramSettings = async () => {
    const settings = await monogramModel.getCustomMonogramSettings();
    if (!settings) throw new Error("Custom monogram settings not found");
    return settings;
};

const updateCustomMonogramSettings = async (id, data) => {
    if (data.upload_price < 0) throw new Error("Upload price cannot be negative");
    if (data.max_file_size_mb <= 0) throw new Error("Maximum file size must be greater than 0");
    if (!data.allowed_file_types || data.allowed_file_types.length === 0) throw new Error("At least one allowed file type must be selected");

    // We only support updating setting_id = 1
    if (parseInt(id) !== 1) throw new Error("Invalid setting ID");

    await getCustomMonogramSettings(); // Ensure exists

    await monogramModel.updateCustomMonogramSettings(id, data);
    return await getCustomMonogramSettings();
};

module.exports = {
    // Placements
    getPlacements,
    getPlacementById,
    createPlacement,
    updatePlacement,
    deletePlacement,
    // Colors
    getColors,
    getColorById,
    createColor,
    updateColor,
    deleteColor,
    // Fonts
    getFonts,
    getFontById,
    createFont,
    updateFont,
    deleteFont,
    // Custom Monogram Settings
    getCustomMonogramSettings,
    updateCustomMonogramSettings,
};
