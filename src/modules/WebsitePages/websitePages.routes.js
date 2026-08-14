const express = require('express');
const { 
  getWebsitePages, 
  getAllPagesForAdmin, 
  toggleStatus, 
  toggleNavbar, 
  toggleFooter, 
  reorderPages 
} = require('./websitePages.controller');
const { authenticateAdminToken } = require('../../middleware/adminAuth.middleware');

const publicRouter = express.Router();
const adminRouter = express.Router();

// Public route to get pages for context (navbar/footer/routing)
publicRouter.get('/', getWebsitePages);

// Admin routes
adminRouter.use(authenticateAdminToken);

adminRouter.get('/', getAllPagesForAdmin);
adminRouter.put('/reorder', reorderPages);
adminRouter.put('/:id/status', toggleStatus);
adminRouter.put('/:id/navbar', toggleNavbar);
adminRouter.put('/:id/footer', toggleFooter);

module.exports = {
  publicRouter,
  adminRouter
};
