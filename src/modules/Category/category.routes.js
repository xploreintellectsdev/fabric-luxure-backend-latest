const express = require("express");
const router = express.Router();
const categoryController = require("./category.controller");
const createUploader = require("../../middleware/multerConfig");

const upload = createUploader("category");

router.post(
  "/",
  upload.single("categoryImage"),
  categoryController.createCategoryEntry,
);
router.get("/", categoryController.getAllCategories);
router.get("/:id", categoryController.getCategoryById);
router.put("/:id", upload.single("categoryImage"), categoryController.updateCategory);
router.delete("/:id", categoryController.deleteCategory);

module.exports = router;
