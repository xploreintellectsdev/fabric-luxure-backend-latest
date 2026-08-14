const express = require("express");
const router = express.Router();
const dynamicSizeChartController = require("./dynamicSizeChart.controller");

router.get("/", dynamicSizeChartController.getAllSizes);
router.get("/active", dynamicSizeChartController.getActiveSizes);
router.post("/", dynamicSizeChartController.createSize);
router.put("/:id", dynamicSizeChartController.updateSize);
router.delete("/:id", dynamicSizeChartController.deleteSize);

module.exports = router;
