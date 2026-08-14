const express = require("express");
const router = express.Router();
const pantSizeChartController = require("./pantSizeChart.controller");

router.get("/", pantSizeChartController.getAllSizes);
router.get("/active", pantSizeChartController.getActiveSizes);
router.post("/", pantSizeChartController.createSize);
router.put("/:id", pantSizeChartController.updateSize);
router.delete("/:id", pantSizeChartController.deleteSize);

module.exports = router;
