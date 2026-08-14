const express = require('express');
const { getShopHeroCMS, updateShopHeroCMS } = require('./shopPage.controller');
const { authenticateAdminToken } = require('../../middleware/adminAuth.middleware');
const createUploader = require("../../middleware/multerConfig");
const uploadImage = createUploader('home');

const adminRouter = express.Router();
adminRouter.use(authenticateAdminToken);

adminRouter.get('/shop-hero', getShopHeroCMS);
adminRouter.put('/shop-hero', uploadImage.single('background_image'), updateShopHeroCMS);

const publicRouter = express.Router();
publicRouter.get('/shop-hero', getShopHeroCMS);

module.exports = { adminRouter, publicRouter };
