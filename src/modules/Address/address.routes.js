const express = require("express");
const router = express.Router();
const addressController = require("./address.controller");
const { authenticateToken } = require("../../middleware/auth.middleware");

// All address endpoints are protected by authentication token
router.post("/", authenticateToken, addressController.createAddress);
router.get("/", authenticateToken, addressController.getAddresses);
router.get("/:id", authenticateToken, addressController.getAddressById);
router.put("/:id", authenticateToken, addressController.updateAddress);
router.delete("/:id", authenticateToken, addressController.deleteAddress);

module.exports = router;
