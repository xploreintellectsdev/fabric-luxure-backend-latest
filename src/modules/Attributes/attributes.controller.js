const attributesService = require("./attributes.service");

const getAllAttributes = async (req, res) => {
  try {
    const { type } = req.params;
    if (!attributesService.getTableInfo(type)) {
      return res.status(400).json({ success: false, error: "Invalid attribute type" });
    }
    
    const result = await attributesService.getAllAttributes(type);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error(`❌ Get All Attributes Error (${req.params.type}):`, error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const createAttribute = async (req, res) => {
  try {
    const { type } = req.params;
    const info = attributesService.getTableInfo(type);
    if (!info) return res.status(400).json({ success: false, error: "Invalid attribute type" });

    const { name, color_code } = req.body;
    const trimmed = name ? name.trim() : "";

    if (!trimmed) {
      return res.status(400).json({ success: false, error: "Name cannot be empty." });
    }

    const existing = await attributesService.getAttributeByName(type, trimmed);
    if (existing) {
      return res.status(409).json({ success: false, error: "This value already exists." });
    }

    const data = { name: trimmed };
    if (type === "colors") {
      data.color_code = color_code ? color_code.trim() : "";
    }

    const result = await attributesService.createAttribute(type, data);
    return res.status(201).json({
      success: true,
      message: "Created successfully",
      data: result,
    });
  } catch (error) {
    console.error(`❌ Create Attribute Error (${req.params.type}):`, error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const updateAttribute = async (req, res) => {
  try {
    const { type, id } = req.params;
    const info = attributesService.getTableInfo(type);
    if (!info) return res.status(400).json({ success: false, error: "Invalid attribute type" });

    const { name, color_code } = req.body;
    const trimmed = name ? name.trim() : "";

    if (!trimmed) {
      return res.status(400).json({ success: false, error: "Name cannot be empty." });
    }

    const existingRecord = await attributesService.getAttributeById(type, id);
    if (!existingRecord) {
      return res.status(404).json({ success: false, error: "Record not found." });
    }

    const duplicate = await attributesService.getAttributeByName(type, trimmed);
    if (duplicate && duplicate[info.idField] !== Number(id)) {
      return res.status(409).json({ success: false, error: "This value already exists." });
    }

    const data = { name: trimmed };
    if (type === "colors") {
      data.color_code = color_code ? color_code.trim() : "";
    }

    const result = await attributesService.updateAttribute(type, id, data);
    return res.status(200).json({
      success: true,
      message: "Updated successfully",
      data: result,
    });
  } catch (error) {
    console.error(`❌ Update Attribute Error (${req.params.type}):`, error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const toggleAttributeStatus = async (req, res) => {
  try {
    const { type, id } = req.params;
    const { is_active } = req.body;
    if (!attributesService.getTableInfo(type)) {
      return res.status(400).json({ success: false, error: "Invalid attribute type" });
    }

    const existingRecord = await attributesService.getAttributeById(type, id);
    if (!existingRecord) {
      return res.status(404).json({ success: false, error: "Record not found." });
    }

    const result = await attributesService.toggleAttributeStatus(type, id, is_active);
    return res.status(200).json({
      success: true,
      message: "Status updated successfully",
      data: result,
    });
  } catch (error) {
    console.error(`❌ Toggle Attribute Status Error (${req.params.type}):`, error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const deleteAttribute = async (req, res) => {
  try {
    const { type, id } = req.params;
    if (!attributesService.getTableInfo(type)) {
      return res.status(400).json({ success: false, error: "Invalid attribute type" });
    }

    const existingRecord = await attributesService.getAttributeById(type, id);
    if (!existingRecord) {
      return res.status(404).json({ success: false, error: "Record not found." });
    }


    const result = await attributesService.deleteAttribute(type, id);
    return res.status(200).json({
      success: true,
      message: "Deleted successfully",
      data: result,
    });
  } catch (error) {
    console.error(`❌ Delete Attribute Error (${req.params.type}):`, error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getAllAttributes,
  createAttribute,
  updateAttribute,
  toggleAttributeStatus,
  deleteAttribute,
};
