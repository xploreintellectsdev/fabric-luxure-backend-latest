const express = require("express");
const { authenticateAdminToken } = require("../../middleware/adminAuth.middleware");
const faqsController = require("./faqs.controller");

const publicRouter = express.Router();
const adminRouter = express.Router();

// PUBLIC ROUTES (for customer website)
publicRouter.get("/", faqsController.getActiveFaqs);

// ADMIN ROUTES
adminRouter.use(authenticateAdminToken);
adminRouter.get("/", faqsController.getFaqs);
adminRouter.post("/", faqsController.createFaq);
adminRouter.put("/:id", faqsController.updateFaq);
adminRouter.patch("/:id/status", faqsController.updateFaqStatus);

module.exports = {
  publicRouter,
  adminRouter
};
