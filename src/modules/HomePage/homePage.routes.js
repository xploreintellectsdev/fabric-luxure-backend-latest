const express = require('express');
const { 
  getHeroCMS, updateHeroCMS, 
  getBreathCMS, updateBreathCMS,
  getTopPicksCMS, updateTopPicksCMS,
  getShopCategoryCMS, updateShopCategoryCMS,
  getShopByCMS, updateShopByCMS,
  getWhereComfortMeetsCMS, updateWhereComfortMeetsCMS,
  getExclusiveSummerCMS, updateExclusiveSummerCMS,
  getWhyLinenCMS, updateWhyLinenCMS,
  getWhyFabricLuxureCMS, updateWhyFabricLuxureCMS,
  getOurPscCMS, updateOurPscCMS,
  getCustomersSayCMS, updateCustomersSayCMS,
  getWeBelieveCMS, updateWeBelieveCMS,
  getFaqCMS, updateFaqCMS
} = require('./homePage.controller');
const { authenticateAdminToken } = require('../../middleware/adminAuth.middleware');
const createUploader = require("../../middleware/multerConfig");

const adminRouter = express.Router();
const upload = createUploader("home");

adminRouter.use(authenticateAdminToken);
adminRouter.get('/hero', getHeroCMS);
adminRouter.put('/hero', upload.single("background_image"), updateHeroCMS);
adminRouter.get('/breath', getBreathCMS);
adminRouter.put('/breath', upload.single("image"), updateBreathCMS);

adminRouter.get('/top-picks', getTopPicksCMS);
adminRouter.put('/top-picks', updateTopPicksCMS);
adminRouter.get('/shop-category', getShopCategoryCMS);
adminRouter.put('/shop-category', updateShopCategoryCMS);
adminRouter.get('/shop-by', getShopByCMS);
adminRouter.put('/shop-by', updateShopByCMS);
adminRouter.get('/where-comfort-meets', getWhereComfortMeetsCMS);
adminRouter.put('/where-comfort-meets', upload.single("image"), updateWhereComfortMeetsCMS);
adminRouter.get('/exclusive-summer', getExclusiveSummerCMS);
adminRouter.put('/exclusive-summer', updateExclusiveSummerCMS);
adminRouter.get('/why-linen', getWhyLinenCMS);
adminRouter.put('/why-linen', upload.single("background_image"), updateWhyLinenCMS);
adminRouter.get('/why-fabric-luxure', getWhyFabricLuxureCMS);
adminRouter.put('/why-fabric-luxure', updateWhyFabricLuxureCMS);
adminRouter.get('/our-psc', getOurPscCMS);
adminRouter.put('/our-psc', upload.fields([{ name: 'card_1_image', maxCount: 1 }, { name: 'card_2_image', maxCount: 1 }, { name: 'card_3_image', maxCount: 1 }]), updateOurPscCMS);
adminRouter.get('/customers-say', getCustomersSayCMS);
adminRouter.put('/customers-say', updateCustomersSayCMS);
adminRouter.get('/we-believe', getWeBelieveCMS);
adminRouter.put('/we-believe', updateWeBelieveCMS);
adminRouter.get('/faq', getFaqCMS);
adminRouter.put('/faq', updateFaqCMS);

const publicRouter = express.Router();
publicRouter.get('/hero', getHeroCMS);
publicRouter.get('/breath', getBreathCMS);
publicRouter.get('/top-picks', getTopPicksCMS);
publicRouter.get('/shop-category', getShopCategoryCMS);
publicRouter.get('/shop-by', getShopByCMS);
publicRouter.get('/where-comfort-meets', getWhereComfortMeetsCMS);
publicRouter.get('/exclusive-summer', getExclusiveSummerCMS);
publicRouter.get('/why-linen', getWhyLinenCMS);
publicRouter.get('/why-fabric-luxure', getWhyFabricLuxureCMS);
publicRouter.get('/our-psc', getOurPscCMS);
publicRouter.get('/customers-say', getCustomersSayCMS);
publicRouter.get('/we-believe', getWeBelieveCMS);
publicRouter.get('/faq', getFaqCMS);

module.exports = { adminRouter, publicRouter };
