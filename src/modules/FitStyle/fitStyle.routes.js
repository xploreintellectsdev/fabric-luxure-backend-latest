const express = require("express");
const router = express.Router();
const fitStyleController = require("./fitStyle.controller");

router.get("/", fitStyleController.getAllFitStyles);
router.get("/active", fitStyleController.getActiveFitStylesByProductType);
router.get("/active/:pro_type_id", fitStyleController.getActiveFitStylesByProductType);
router.get("/:id", fitStyleController.getFitStyleById);
router.post("/", fitStyleController.createFitStyle);
router.put("/:id", fitStyleController.updateFitStyle);
router.delete("/:id", fitStyleController.deleteFitStyle);

module.exports = router;
