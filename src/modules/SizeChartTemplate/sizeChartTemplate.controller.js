const sizeChartTemplateService = require("./sizeChartTemplate.service");
const fs = require("fs");
const path = require("path");

// Helper to delete files from server disk
const deleteImageFile = (imagePath) => {
  if (!imagePath) return;
  const relative = imagePath.startsWith("/") ? imagePath.substring(1) : imagePath;
  const fullPath = path.join(__dirname, "../..", relative);
  try {
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log(`Deleted file: ${fullPath}`);
    }
  } catch (err) {
    console.error(`❌ Error deleting file ${fullPath}:`, err.message);
  }
};

// ========================
// GET ALL SIZE CHART TEMPLATES
// ========================
const getAllTemplates = async (req, res) => {
  try {
    const result = await sizeChartTemplateService.getAllTemplates();
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error("❌ Get All Templates Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ========================
// CREATE SIZE CHART TEMPLATE
// ========================
const createTemplate = async (req, res) => {
  try {
    const { pro_type_id, template_name, is_active } = req.body;

    // Validations
    if (!pro_type_id) {
      if (req.file) deleteImageFile(`/uploads/size-chart/${req.file.filename}`);
      return res.status(400).json({ success: false, error: "Product Type is required." });
    }
    if (!template_name || !template_name.trim()) {
      if (req.file) deleteImageFile(`/uploads/size-chart/${req.file.filename}`);
      return res.status(400).json({ success: false, error: "Template Name is required." });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: "Image file is required." });
    }

    // Enforce 2MB size limit manually if needed
    if (req.file.size > 2 * 1024 * 1024) {
      deleteImageFile(`/uploads/size-chart/${req.file.filename}`);
      return res.status(400).json({ success: false, error: "Image file size exceeds 2MB limit." });
    }

    const image_path = `/uploads/size-chart/${req.file.filename}`;
    const isActiveVal = is_active === "true" || is_active === true || is_active === 1 || is_active === "1";

    const result = await sizeChartTemplateService.createTemplate({
      pro_type_id: Number(pro_type_id),
      template_name: template_name.trim(),
      image_path,
      is_active: isActiveVal
    });

    return res.status(201).json({
      success: true,
      message: "Size chart template created successfully",
      data: result
    });
  } catch (error) {
    if (req.file) deleteImageFile(`/uploads/size-chart/${req.file.filename}`);
    console.error("❌ Create Template Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ========================
// UPDATE SIZE CHART TEMPLATE
// ========================
const updateTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { pro_type_id, template_name, is_active } = req.body;

    const existingRecord = await sizeChartTemplateService.getTemplateById(id);
    if (!existingRecord) {
      if (req.file) deleteImageFile(`/uploads/size-chart/${req.file.filename}`);
      return res.status(404).json({
        success: false,
        error: "Size chart template not found."
      });
    }

    // Validations
    if (!pro_type_id) {
      if (req.file) deleteImageFile(`/uploads/size-chart/${req.file.filename}`);
      return res.status(400).json({ success: false, error: "Product Type is required." });
    }
    if (!template_name || !template_name.trim()) {
      if (req.file) deleteImageFile(`/uploads/size-chart/${req.file.filename}`);
      return res.status(400).json({ success: false, error: "Template Name is required." });
    }

    let image_path = existingRecord.image_path;

    if (req.file) {
      // Size check
      if (req.file.size > 2 * 1024 * 1024) {
        deleteImageFile(`/uploads/size-chart/${req.file.filename}`);
        return res.status(400).json({ success: false, error: "Image file size exceeds 2MB limit." });
      }

      // Delete old file
      deleteImageFile(existingRecord.image_path);
      image_path = `/uploads/size-chart/${req.file.filename}`;
    }

    const isActiveVal = is_active === "true" || is_active === true || is_active === 1 || is_active === "1";

    const result = await sizeChartTemplateService.updateTemplate(id, {
      pro_type_id: Number(pro_type_id),
      template_name: template_name.trim(),
      image_path,
      is_active: isActiveVal
    });

    return res.status(200).json({
      success: true,
      message: "Size chart template updated successfully",
      data: result
    });
  } catch (error) {
    if (req.file) deleteImageFile(`/uploads/size-chart/${req.file.filename}`);
    console.error("❌ Update Template Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ========================
// DELETE SIZE CHART TEMPLATE
// ========================
const deleteTemplate = async (req, res) => {
  try {
    const { id } = req.params;

    const existingRecord = await sizeChartTemplateService.getTemplateById(id);
    if (!existingRecord) {
      return res.status(404).json({
        success: false,
        error: "Size chart template not found."
      });
    }

    // Delete image file from server
    deleteImageFile(existingRecord.image_path);

    // Delete database record
    const result = await sizeChartTemplateService.deleteTemplate(id);

    return res.status(200).json({
      success: true,
      message: "Size chart template deleted successfully",
      data: result
    });
  } catch (error) {
    console.error("❌ Delete Template Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

module.exports = {
  getAllTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate
};
