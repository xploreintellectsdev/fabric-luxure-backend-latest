const express = require("express");
const blogsPageController = require("./blogsPage.controller");
const { authenticateAdminToken } = require("../../middleware/adminAuth.middleware");
const createUploader = require("../../middleware/multerConfig");
const uploadImage = createUploader("blogs");

const adminRouter = express.Router();
adminRouter.use(authenticateAdminToken);

adminRouter.get("/blogs-hero", blogsPageController.getBlogsHero);
adminRouter.put("/blogs-hero", uploadImage.single("background_image"), blogsPageController.updateBlogsHero);

adminRouter.get("/latest-articles", blogsPageController.getLatestArticles);
adminRouter.put("/latest-articles", blogsPageController.updateLatestArticles);

adminRouter.get("/heritage", blogsPageController.getHeritage);
adminRouter.put("/heritage", blogsPageController.updateHeritage);

const publicRouter = express.Router();
publicRouter.get("/blogs-hero", blogsPageController.getBlogsHero);
publicRouter.get("/latest-articles", blogsPageController.getLatestArticles);
publicRouter.get("/heritage", blogsPageController.getHeritage);

module.exports = { adminRouter, publicRouter };
