const contactPageService = require('./contactPage.service');

const getHeroConfig = async (req, res) => {
    try {
        const config = await contactPageService.getHeroConfig();
        res.status(200).json({ success: true, data: config });
    } catch (error) {
        console.error('Error in getHeroConfig:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch contact page hero config' });
    }
};

const updateHeroConfig = async (req, res) => {
    try {
        const data = req.body;
        const file = req.file;
        
        let background_image_path = null;
        if (file) {
            background_image_path = `/uploads/contact-page/${file.filename}`;
        }

        await contactPageService.updateHeroConfig(data, background_image_path);
        res.status(200).json({ success: true, message: 'Contact page hero config updated successfully' });
    } catch (error) {
        console.error('Error in updateHeroConfig:', error);
        res.status(500).json({ success: false, message: 'Failed to update contact page hero config' });
    }
};

const getContactInfo = async (req, res) => {
    try {
        const config = await contactPageService.getContactInfo();
        res.status(200).json({ success: true, data: config });
    } catch (error) {
        console.error('Error in getContactInfo:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch contact information' });
    }
};

const updateContactInfo = async (req, res) => {
    try {
        const data = req.body;
        await contactPageService.updateContactInfo(data);
        res.status(200).json({ success: true, message: 'Contact information updated successfully' });
    } catch (error) {
        console.error('Error in updateContactInfo:', error);
        res.status(500).json({ success: false, message: 'Failed to update contact information' });
    }
};

const getFormConfig = async (req, res) => {
    try {
        const config = await contactPageService.getFormConfig();
        res.status(200).json({ success: true, data: config });
    } catch (error) {
        console.error('Error in getFormConfig:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch form configuration' });
    }
};

const updateFormConfig = async (req, res) => {
    try {
        const data = req.body;
        const file = req.file;
        
        let section_image = null;
        if (file) {
            section_image = `/uploads/contact-page/${file.filename}`;
        }

        await contactPageService.updateFormConfig(data, section_image);
        res.status(200).json({ success: true, message: 'Form configuration updated successfully' });
    } catch (error) {
        console.error('Error in updateFormConfig:', error);
        res.status(500).json({ success: false, message: 'Failed to update form configuration' });
    }
};

const getConversationConfig = async (req, res) => {
    try {
        const config = await contactPageService.getConversationConfig();
        res.status(200).json({ success: true, data: config });
    } catch (error) {
        console.error('Error in getConversationConfig:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch conversation configuration' });
    }
};

const updateConversationConfig = async (req, res) => {
    try {
        const data = req.body;
        await contactPageService.updateConversationConfig(data);
        res.status(200).json({ success: true, message: 'Conversation configuration updated successfully' });
    } catch (error) {
        console.error('Error in updateConversationConfig:', error);
        res.status(500).json({ success: false, message: 'Failed to update conversation configuration' });
    }
};

module.exports = {
    getHeroConfig,
    updateHeroConfig,
    getContactInfo,
    updateContactInfo,
    getFormConfig,
    updateFormConfig,
    getConversationConfig,
    updateConversationConfig
};
