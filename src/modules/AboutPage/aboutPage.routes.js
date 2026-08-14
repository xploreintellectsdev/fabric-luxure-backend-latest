const express = require("express");
const aboutPageController = require("./aboutPage.controller");
const createUploader = require("../../middleware/multerConfig");

const upload = createUploader("about-us");

// Admin Router
const adminRouter = express.Router();
adminRouter.get("/about-hero", aboutPageController.getAboutHero);
adminRouter.put("/about-hero", upload.single("hero_image"), aboutPageController.updateAboutHero);

adminRouter.get("/where-it-began", aboutPageController.getWhereItBegan);
adminRouter.put("/where-it-began", upload.single("image_path"), aboutPageController.updateWhereItBegan);

adminRouter.get("/what-we-stand-for", aboutPageController.getWhatWeStandFor);
adminRouter.put("/what-we-stand-for", aboutPageController.updateWhatWeStandFor);

adminRouter.get("/the-making", aboutPageController.getTheMaking);
adminRouter.put("/the-making", upload.single("section_image"), aboutPageController.updateTheMaking);

adminRouter.get("/the-people", aboutPageController.getThePeople);
adminRouter.put("/the-people", upload.single("section_image"), aboutPageController.updateThePeople);

adminRouter.get("/experience-linen", aboutPageController.getExperienceLinen);
adminRouter.put(
  "/experience-linen", 
  upload.fields([
    { name: "image_1", maxCount: 1 },
    { name: "image_2", maxCount: 1 },
    { name: "image_3", maxCount: 1 },
    { name: "image_4", maxCount: 1 }
  ]), 
  aboutPageController.updateExperienceLinen
);

// Public Router
const publicRouter = express.Router();
publicRouter.get("/about-hero", (req, res, next) => {
  req.isPublicRoute = true;
  return aboutPageController.getAboutHero(req, res, next);
});

publicRouter.get("/where-it-began", (req, res, next) => {
  req.isPublicRoute = true;
  return aboutPageController.getWhereItBegan(req, res, next);
});

publicRouter.get("/what-we-stand-for", (req, res, next) => {
  req.isPublicRoute = true;
  return aboutPageController.getWhatWeStandFor(req, res, next);
});

publicRouter.get("/the-making", (req, res, next) => {
  req.isPublicRoute = true;
  return aboutPageController.getTheMaking(req, res, next);
});

publicRouter.get("/the-people", (req, res, next) => {
  req.isPublicRoute = true;
  return aboutPageController.getThePeople(req, res, next);
});

publicRouter.get("/experience-linen", (req, res, next) => {
  req.isPublicRoute = true;
  return aboutPageController.getExperienceLinen(req, res, next);
});

module.exports = {
  adminRouter,
  publicRouter
};
