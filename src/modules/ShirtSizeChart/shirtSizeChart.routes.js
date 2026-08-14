const express = require("express");
const router = express.Router();
const shirtSizeChartController = require("./shirtSizeChart.controller");

router.get("/", shirtSizeChartController.getAllSizes);
router.get("/active", shirtSizeChartController.getActiveSizes);
router.post("/", shirtSizeChartController.createSize);
router.put("/:id", shirtSizeChartController.updateSize);
router.delete("/:id", shirtSizeChartController.deleteSize);

module.exports = router;
