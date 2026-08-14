const express = require("express");
const router = express.Router();
const productCategoryController = require("./productCategory.controller");
const createUploader = require("../../middleware/multerConfig");

const upload = createUploader("category");

router.get("/", productCategoryController.getAllProductCategories);
router.get("/:id", productCategoryController.getProductCategoryById);
router.post("/", upload.single("categoryImage"), productCategoryController.createProductCategory);
router.put("/:id", upload.single("categoryImage"), productCategoryController.updateProductCategory);
router.delete("/:id", productCategoryController.deleteProductCategory);
router.put("/:id/status", productCategoryController.toggleProductCategoryStatus);

module.exports = router;
