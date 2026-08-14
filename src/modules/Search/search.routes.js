const express = require("express");
const router = express.Router();
const searchController = require("./search.controller");

router.get("/sidebar", searchController.getSidebarData);
router.get("/", searchController.getLiveSuggestions);

module.exports = router;
