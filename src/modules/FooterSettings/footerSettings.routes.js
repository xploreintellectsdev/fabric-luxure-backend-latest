const express = require('express');
const router = express.Router();
const footerSettingsController = require('./footerSettings.controller');
const { authenticateAdminToken } = require('../../middleware/adminAuth.middleware');

const publicRouter = express.Router();
const adminRouter = express.Router();

// Public route to fetch footer settings for the frontend
publicRouter.get('/', footerSettingsController.getFooterSettings);

// Admin routes
adminRouter.get('/', authenticateAdminToken, footerSettingsController.getFooterSettings);
adminRouter.put('/', authenticateAdminToken, footerSettingsController.updateFooterSettings);

module.exports = {
    publicRouter,
    adminRouter
};
