const express = require("express");
const monogramController = require("./monogram.controller");
const createUploader = require("../../middleware/multerConfig");
const customUpload = require("../../middleware/customUpload.middleware");
const { authenticateAdminToken } = require("../../middleware/adminAuth.middleware");

const adminRoutes = express.Router();
const publicRoutes = express.Router();

// Uploaders for each type
const placementUpload = createUploader("monogram_placements");
const colorUpload = createUploader("monogram_colors");
const fontUpload = createUploader("monogram_fonts");

// ========================
// Admin Routes (Protected)
// Base: /api/admin/monogram
// ========================

adminRoutes.use(authenticateAdminToken);

// Placements
adminRoutes.get("/placements", monogramController.getAdminPlacements);
adminRoutes.get("/placements/:id", monogramController.getPlacementById);
adminRoutes.post("/placements", placementUpload.single("placement_image"), monogramController.createPlacement);
adminRoutes.put("/placements/:id", placementUpload.single("placement_image"), monogramController.updatePlacement);
adminRoutes.delete("/placements/:id", monogramController.deletePlacement);

// Colors
adminRoutes.get("/colors", monogramController.getAdminColors);
adminRoutes.get("/colors/:id", monogramController.getColorById);
adminRoutes.post("/colors", colorUpload.single("color_image"), monogramController.createColor);
adminRoutes.put("/colors/:id", colorUpload.single("color_image"), monogramController.updateColor);
adminRoutes.delete("/colors/:id", monogramController.deleteColor);

// Fonts
adminRoutes.get("/fonts", monogramController.getAdminFonts);
adminRoutes.get("/fonts/:id", monogramController.getFontById);
adminRoutes.post("/fonts", fontUpload.single("font_preview_image"), monogramController.createFont);
adminRoutes.put("/fonts/:id", fontUpload.single("font_preview_image"), monogramController.updateFont);
adminRoutes.delete("/fonts/:id", monogramController.deleteFont);


// Custom Monogram Settings
adminRoutes.get("/custom-monogram-settings", monogramController.getCustomMonogramSettings);
adminRoutes.put("/custom-monogram-settings/:id", monogramController.updateCustomMonogramSettings);


// ========================
// Public Routes (Unprotected)
// Base: /api/monogram
// ========================

// Return only active items
publicRoutes.get("/placements", monogramController.getPublicPlacements);
publicRoutes.get("/colors", monogramController.getPublicColors);
publicRoutes.get("/fonts", monogramController.getPublicFonts);
publicRoutes.get("/custom-monogram-settings", monogramController.getCustomMonogramSettings);

// Custom upload
publicRoutes.post("/upload-custom", customUpload.single("custom_monogram_file"), monogramController.uploadCustomMonogram);

module.exports = {
    adminRoutes,
    publicRoutes
};
