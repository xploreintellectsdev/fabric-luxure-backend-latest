const corporateOrderService = require('./corporateOrder.service');
const emailService = require('../../services/email.service');

const createCorporateOrder = async (req, res) => {
  try {
    const data = req.body;
    
    // If the token was decoded successfully by authenticateTokenOptional
    if (req.user) {
      data.user_id = req.user.user_id || req.user.userId;
    } else {
      data.user_id = null;
    }

    const result = await corporateOrderService.submitEnquiry(data);
    
    // Asynchronously send emails (do not block the response)
    Promise.all([
      emailService.sendCorporateOrderConfirmationEmail(data),
      emailService.sendCorporateOrderAdminNotification(data)
    ]).catch((emailErr) => {
      console.error("❌ Corporate Order Email Sending Failed:", emailErr.message);
    });

    return res.status(201).json({
      success: true,
      data: result,
      message: "Your Corporate Order enquiry has been submitted successfully."
    });
  } catch (error) {
    console.error("❌ Corporate Order Controller Error (createCorporateOrder):", error.message);
    return res.status(400).json({ success: false, error: error.message });
  }
};

const getAdminCorporateOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';

    const result = await corporateOrderService.getAdminEnquiries(page, limit, search);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error("❌ Corporate Order Controller Error (getAdminCorporateOrders):", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const getAdminCorporateOrderDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await corporateOrderService.getEnquiryDetails(id);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error("❌ Corporate Order Controller Error (getAdminCorporateOrderDetails):", error.message);
    return res.status(404).json({ success: false, error: error.message });
  }
};

const updateCorporateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ success: false, error: "Status is required." });
    }

    const updated = await corporateOrderService.updateEnquiryStatus(id, status);
    if (!updated) {
      return res.status(404).json({ success: false, error: "Enquiry not found." });
    }

    return res.status(200).json({ success: true, message: "Status updated successfully." });
  } catch (error) {
    console.error("❌ Corporate Order Controller Error (updateCorporateOrderStatus):", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  createCorporateOrder,
  getAdminCorporateOrders,
  getAdminCorporateOrderDetails,
  updateCorporateOrderStatus
};
