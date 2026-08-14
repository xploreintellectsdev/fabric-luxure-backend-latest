const express = require("express");
const eventsPageController = require("./eventsPage.controller");
const { authenticateAdminToken } = require("../../middleware/adminAuth.middleware");
const createUploader = require("../../middleware/multerConfig");
const uploadImage = createUploader("events");

const adminRouter = express.Router();
adminRouter.use(authenticateAdminToken);

adminRouter.get("/events-hero", eventsPageController.getEventsHero);
adminRouter.put("/events-hero", uploadImage.single("hero_image"), eventsPageController.updateEventsHero);

adminRouter.get("/featured-event", eventsPageController.getFeaturedEventCMS);
adminRouter.put("/featured-event", eventsPageController.updateFeaturedEventCMS);

const publicRouter = express.Router();
publicRouter.get("/events-hero", eventsPageController.getEventsHero);
publicRouter.get("/featured-event", eventsPageController.getFeaturedEventCMS);

module.exports = { adminRouter, publicRouter };
