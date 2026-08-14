const faqsService = require("./faqs.service");

const getFaqs = async (req, res) => {
  try {
    const { search = "", sort = "display_order", order = "ASC", page = 1, limit = 10 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const data = await faqsService.getFaqs(search, sort, order, Number(limit), offset);
    
    return res.status(200).json({
      success: true,
      data: data.rows,
      total: data.total
    });
  } catch (error) {
    console.error("❌ Get FAQs Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const getActiveFaqs = async (req, res) => {
  try {
    const rows = await faqsService.getActiveFaqs();
    return res.status(200).json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error("❌ Get Active FAQs Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const createFaq = async (req, res) => {
  try {
    const { question, answer, display_order, is_active } = req.body;
    if (!question || !answer) {
      return res.status(400).json({ success: false, error: "Question and Answer are required." });
    }
    const insertId = await faqsService.createFaq({ question, answer, display_order, is_active });
    return res.status(201).json({
      success: true,
      message: "FAQ created successfully.",
      data: { faq_id: insertId }
    });
  } catch (error) {
    console.error("❌ Create FAQ Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const updateFaq = async (req, res) => {
  try {
    const { id } = req.params;
    const { question, answer, display_order, is_active } = req.body;
    if (!question || !answer) {
      return res.status(400).json({ success: false, error: "Question and Answer are required." });
    }
    const success = await faqsService.updateFaq(id, { question, answer, display_order, is_active });
    if (!success) {
      return res.status(404).json({ success: false, error: "FAQ not found." });
    }
    return res.status(200).json({
      success: true,
      message: "FAQ updated successfully."
    });
  } catch (error) {
    console.error("❌ Update FAQ Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const updateFaqStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;
    if (is_active === undefined) {
      return res.status(400).json({ success: false, error: "is_active is required." });
    }
    const success = await faqsService.updateFaqStatus(id, is_active);
    if (!success) {
      return res.status(404).json({ success: false, error: "FAQ not found." });
    }
    return res.status(200).json({
      success: true,
      message: "FAQ status updated successfully."
    });
  } catch (error) {
    console.error("❌ Update FAQ Status Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getFaqs,
  getActiveFaqs,
  createFaq,
  updateFaq,
  updateFaqStatus
};
