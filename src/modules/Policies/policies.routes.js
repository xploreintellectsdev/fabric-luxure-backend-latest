const express = require('express');
const policiesController = require('./policies.controller');
const { authenticateAdminToken } = require('../../middleware/adminAuth.middleware');

const publicRouter = express.Router();
const adminRouter = express.Router();

// Public routes
publicRouter.get('/', policiesController.getPolicies);
publicRouter.get('/:page_key', policiesController.getPolicyByPageKey);

// Admin routes
adminRouter.get('/', authenticateAdminToken, policiesController.adminGetPolicies);
adminRouter.get('/:page_key', authenticateAdminToken, policiesController.adminGetPolicyByPageKey);
adminRouter.put('/:page_id', authenticateAdminToken, policiesController.adminUpdatePolicyPage);
adminRouter.post('/:page_id/sections', authenticateAdminToken, policiesController.adminCreatePolicySection);
adminRouter.put('/sections/:section_id', authenticateAdminToken, policiesController.adminUpdatePolicySection);
adminRouter.delete('/sections/:section_id', authenticateAdminToken, policiesController.adminDeletePolicySection);
adminRouter.put('/reorder/sections', authenticateAdminToken, policiesController.adminReorderSections);

module.exports = {
  publicRouter,
  adminRouter
};
