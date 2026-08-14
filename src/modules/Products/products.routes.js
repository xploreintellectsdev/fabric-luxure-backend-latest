const express = require("express");
const router = express.Router();
const productController = require("./products.controller");
const createUploader = require("../../middleware/multerConfig");

const upload = createUploader("products");

router.get("/", productController.getAllProducts);
router.get("/search", productController.searchProducts);
router.get("/:id", productController.getProductById);

router.post(
  "/",
  upload.fields([
    { name: "coverImage", maxCount: 1 },
    { name: "additionalImages", maxCount: 10 },
  ]),
  productController.createProduct
);

router.put(
  "/:id",
  upload.fields([
    { name: "coverImage", maxCount: 1 },
    { name: "additionalImages", maxCount: 10 },
  ]),
  productController.updateProduct
);

router.patch("/:id/flags", productController.updateProductFlags);
router.patch("/:id/stock", productController.updateStock);

router.delete("/:id", productController.deleteProduct);
router.put("/:id/status", productController.toggleProductStatus);

module.exports = router;
