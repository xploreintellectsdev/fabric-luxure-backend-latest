const contactService = require('./contact.service');

const createContactEntry = async (req, res) => {
    try {
        const { name, phone, email, message } = req.body;
        console.log("📥 Incoming Enquiry Data from Frontend:", req.body);

        if (!name || !phone || !email || !message) {
            return res.status(400).json({ 
                success: false, 
                error: "All fields (name, phone, email, message) are required." 
            });
        }

        const result = await contactService.processContactMessage({ name, phone, email, message });

        return res.status(201).json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error("❌ Controller Error:", error.message);
        return res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

const getAdminContacts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';

        const result = await contactService.getAdminContacts(page, limit, search);
        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        console.error("❌ Controller Error (getAdminContacts):", error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
};

const updateContactStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        if (!status) {
            return res.status(400).json({ success: false, error: "Status is required." });
        }

        const updated = await contactService.updateContactStatus(id, status);
        if (!updated) {
            return res.status(404).json({ success: false, error: "Contact request not found." });
        }

        return res.status(200).json({ success: true, message: "Status updated successfully." });
    } catch (error) {
        console.error("❌ Controller Error (updateContactStatus):", error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
};

const deleteContact = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await contactService.deleteContact(id);
        
        if (!deleted) {
            return res.status(404).json({ success: false, error: "Contact request not found." });
        }

        return res.status(200).json({ success: true, message: "Contact request deleted successfully." });
    } catch (error) {
        console.error("❌ Controller Error (deleteContact):", error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
    createContactEntry,
    getAdminContacts,
    updateContactStatus,
    deleteContact
};
