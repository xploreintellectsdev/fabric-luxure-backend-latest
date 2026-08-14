const express = require("express");
const router = express.Router();
const productTypeController = require("./productType.controller");

router.get("/", productTypeController.getAllProductTypes);
router.post("/", productTypeController.createProductType);
router.put("/:id", productTypeController.updateProductType);
router.delete("/:id", productTypeController.deleteProductType);
router.put("/:id/status", productTypeController.toggleProductTypeStatus);

module.exports = router;
