const sleeveService = require("./sleeve.service");

// ========================
// Get All Sleeves
// ========================
const getAllSleeves = async (req, res) => {
  try {
    const sleeves = await sleeveService.getAllSleeves();
    res.status(200).json({ success: true, sleeves });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ========================
// Get Active Sleeves by Product Type
// ========================
const getActiveSleevesByProductType = async (req, res) => {
  try {
    const { pro_type_id } = req.params;
    const sleeves = await sleeveService.getActiveSleevesByProductType(pro_type_id);
    res.status(200).json({ success: true, sleeves });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ========================
// Get Sleeve by ID
// ========================
const getSleeveById = async (req, res) => {
  try {
    const sleeve = await sleeveService.getSleeveById(req.params.id);
    if (!sleeve) {
      return res.status(404).json({ success: false, message: "Sleeve not found" });
    }
    res.status(200).json({ success: true, sleeve });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ========================
// Create Sleeve
// ========================
const createSleeve = async (req, res) => {
  try {
    const { pro_type_id, sleeve_name, display_order, is_active } = req.body;
    
    if (!pro_type_id || !sleeve_name) {
      return res.status(400).json({ success: false, message: "Product Type and Sleeve Name are required" });
    }

    const newSleeve = await sleeveService.createSleeve({
      pro_type_id,
      sleeve_name,
      display_order: display_order || 0,
      is_active: is_active !== undefined ? is_active : 1
    });

    res.status(201).json({ success: true, message: "Sleeve created successfully", sleeve: newSleeve });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ========================
// Update Sleeve
// ========================
const updateSleeve = async (req, res) => {
  try {
    const { pro_type_id, sleeve_name, display_order, is_active } = req.body;
    
    if (!pro_type_id || !sleeve_name) {
      return res.status(400).json({ success: false, message: "Product Type and Sleeve Name are required" });
    }

    const updated = await sleeveService.updateSleeve(req.params.id, {
      pro_type_id,
      sleeve_name,
      display_order: display_order || 0,
      is_active: is_active !== undefined ? is_active : 1
    });

    if (!updated) {
      return res.status(404).json({ success: false, message: "Sleeve not found" });
    }

    res.status(200).json({ success: true, message: "Sleeve updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ========================
// Delete / Toggle Status
// ========================
const deleteSleeve = async (req, res) => {
  try {
    const { is_active } = req.body;
    // If is_active is provided, toggle. Else default to soft delete (0)
    const statusToSet = is_active !== undefined ? is_active : 0;
    
    const updated = await sleeveService.toggleSleeveStatus(req.params.id, statusToSet);
    
    if (!updated) {
      return res.status(404).json({ success: false, message: "Sleeve not found" });
    }

    res.status(200).json({ success: true, message: "Sleeve status updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getAllSleeves,
  getActiveSleevesByProductType,
  getSleeveById,
  createSleeve,
  updateSleeve,
  deleteSleeve
};
