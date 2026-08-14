const express = require("express");
const router = express.Router();
const sizeChartTemplateController = require("./sizeChartTemplate.controller");
const createUploader = require("../../middleware/multerConfig");

const upload = createUploader("size-chart");

router.get("/", sizeChartTemplateController.getAllTemplates);
router.post("/", upload.single("image"), sizeChartTemplateController.createTemplate);
router.put("/:id", upload.single("image"), sizeChartTemplateController.updateTemplate);
router.delete("/:id", sizeChartTemplateController.deleteTemplate);

module.exports = router;
