const express = require("express");
const router = express.Router();
const attributesController = require("./attributes.controller");

// Dynamic routes for all 6 attributes
// :type can be: fabric-types, fabric-origins, styles, weaves, colors, patterns

router.get("/:type", attributesController.getAllAttributes);
router.post("/:type", attributesController.createAttribute);
router.put("/:type/:id", attributesController.updateAttribute);
router.put("/:type/:id/toggle", attributesController.toggleAttributeStatus);
router.delete("/:type/:id", attributesController.deleteAttribute);

module.exports = router;
