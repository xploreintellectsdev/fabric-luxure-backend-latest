const express = require("express");
const router = express.Router();
const sleeveController = require("./sleeve.controller");

router.get("/", sleeveController.getAllSleeves);
router.get("/active/:pro_type_id", sleeveController.getActiveSleevesByProductType);
router.get("/:id", sleeveController.getSleeveById);
router.post("/", sleeveController.createSleeve);
router.put("/:id", sleeveController.updateSleeve);
router.delete("/:id", sleeveController.deleteSleeve);

module.exports = router;
