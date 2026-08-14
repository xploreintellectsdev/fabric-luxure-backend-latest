const express = require("express");
const contactPageController = require("./contactPage.controller");
const createUploader = require("../../middleware/multerConfig");

const upload = createUploader("contact-page");

// Admin Router
const adminRouter = express.Router();
adminRouter.get("/hero", contactPageController.getHeroConfig);
adminRouter.put("/hero", upload.single("background_image"), contactPageController.updateHeroConfig);

adminRouter.get("/info", contactPageController.getContactInfo);
adminRouter.put("/info", contactPageController.updateContactInfo);

adminRouter.get("/form-config", contactPageController.getFormConfig);
adminRouter.put("/form-config", upload.single("section_image"), contactPageController.updateFormConfig);

adminRouter.get("/conversation-config", contactPageController.getConversationConfig);
adminRouter.put("/conversation-config", contactPageController.updateConversationConfig);

// Public Router
const publicRouter = express.Router();
publicRouter.get("/hero", (req, res, next) => {
    req.isPublicRoute = true;
    return contactPageController.getHeroConfig(req, res, next);
});

publicRouter.get("/info", (req, res, next) => {
    req.isPublicRoute = true;
    return contactPageController.getContactInfo(req, res, next);
});

publicRouter.get("/form-config", (req, res, next) => {
    req.isPublicRoute = true;
    return contactPageController.getFormConfig(req, res, next);
});

publicRouter.get("/conversation-config", (req, res, next) => {
    req.isPublicRoute = true;
    return contactPageController.getConversationConfig(req, res, next);
});

module.exports = {
    adminRouter,
    publicRouter
};
