const express = require("express");
const eventsController = require("./events.controller");
const createUploader = require("../../middleware/multerConfig");

const upload = createUploader("events");

// Admin Router
const adminRouter = express.Router();
adminRouter.get("/", eventsController.getEvents);
adminRouter.get("/:id", eventsController.getEventById);
adminRouter.post("/", upload.single("event_media"), eventsController.createEvent);
adminRouter.put("/:id", upload.single("event_media"), eventsController.updateEvent);
adminRouter.delete("/:id", eventsController.deleteEvent);

// Public Router
const publicRouter = express.Router();
// Public router only returns active events
publicRouter.get("/", async (req, res, next) => {
  req.query.status = "true"; // Only active
  next();
}, eventsController.getEvents);

publicRouter.get("/:id", eventsController.getEventById);

module.exports = {
  adminRouter,
  publicRouter
};
