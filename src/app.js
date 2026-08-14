const express = require("express");
const cors = require("cors");
const path = require("path");
const contactRoutes = require('./modules/Contact/contact.routes');
const categoryRoutes = require('./modules/Category/category.routes');
const authRoutes = require('./modules/Auth/auth.routes');
const productTypeRoutes = require('./modules/ProductType/productType.routes');
const productCategoryRoutes = require('./modules/ProductCategory/productCategory.routes');
const productRoutes = require('./modules/Products/products.routes');
const dashboardRoutes = require('./modules/Dashboard/dashboard.routes');
const addressRoutes = require('./modules/Address/address.routes');
const sizeChartTemplateRoutes = require('./modules/SizeChartTemplate/sizeChartTemplate.routes');
const dynamicSizeChartRoutes = require('./modules/DynamicSizeChart/dynamicSizeChart.routes');
const fitStyleRoutes = require('./modules/FitStyle/fitStyle.routes');
const sleeveRoutes = require('./modules/Sleeve/sleeve.routes');
const wishlistRoutes = require('./modules/Wishlist/wishlist.routes');
const cartRoutes = require('./modules/Cart/cart.routes');
const ordersRoutes = require('./modules/Orders/orders.routes');
const paymentRoutes = require('./modules/Payment/payment.routes');
const adminRoutes = require('./modules/Admin/admin.routes');
const emailRoutes = require('./modules/Email/email.routes');
const walletRoutes = require('./modules/Wallet/wallet.routes');
const reviewsRoutes = require('./modules/Reviews/reviews.routes');
const corporateOrderRoutes = require('./modules/CorporateOrder/corporateOrder.routes');
const searchRoutes = require('./modules/Search/search.routes');
const attributesRoutes = require('./modules/Attributes/attributes.routes');
const { adminRoutes: adminMonogramRoutes, publicRoutes: publicMonogramRoutes } = require('./modules/Monogram/monogram.routes');
const faqsRoutes = require('./modules/Faqs/faqs.routes');
const eventsRoutes = require('./modules/Events/events.routes');
const blogsRoutes = require('./modules/Blogs/blogs.routes');
const websitePagesRoutes = require('./modules/WebsitePages/websitePages.routes');
const homePageRoutes = require('./modules/HomePage/homePage.routes');
const shopPageRoutes = require('./modules/ShopPage/shopPage.routes');
const eventsPageRoutes = require('./modules/EventsPage/eventsPage.routes');
const blogsPageRoutes = require('./modules/BlogsPage/blogsPage.routes');
const aboutPageRoutes = require('./modules/AboutPage/aboutPage.routes');
const contactPageRoutes = require('./modules/ContactPage/contactPage.routes');
const footerSettingsRoutes = require('./modules/FooterSettings/footerSettings.routes');
const policiesRoutes = require('./modules/Policies/policies.routes');
const emailService = require('./services/email.service');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors())
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/uploads/custom_monograms", express.static(path.join(__dirname, "..", "uploads", "custom_monograms")));
app.use("/uploads/home", express.static(path.join(__dirname, "..", "uploads", "home")));
app.use('/api/contact', contactRoutes);
app.use("/api/category", categoryRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/product-types', productTypeRoutes);
app.use('/api/product-categories', productCategoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/address', addressRoutes);
app.use('/api/admin/size-chart-templates', sizeChartTemplateRoutes);
app.use('/api/admin/size-charts', dynamicSizeChartRoutes);
app.use('/api/admin/fit-styles', fitStyleRoutes);
app.use('/api/admin/sleeves', sleeveRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/cart', cartRoutes);
    
app.use('/api/orders', ordersRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/attributes', attributesRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/corporate-order', corporateOrderRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/monogram', publicMonogramRoutes);
app.use('/api/admin/monogram', adminMonogramRoutes);
app.use('/api/faqs', faqsRoutes.publicRouter);
app.use('/api/admin/faqs', faqsRoutes.adminRouter);

app.use('/api/events', eventsRoutes.publicRouter);
app.use('/api/admin/events', eventsRoutes.adminRouter);

app.use('/api/blogs', blogsRoutes.publicRouter);
app.use('/api/admin/blogs', blogsRoutes.adminRouter);

app.use('/api/website/pages', websitePagesRoutes.publicRouter);
app.use('/api/admin/website-pages', websitePagesRoutes.adminRouter);
app.use('/api/home-page', homePageRoutes.publicRouter);
app.use('/api/admin/home-page', homePageRoutes.adminRouter);
app.use('/api/shop-page', shopPageRoutes.publicRouter);
app.use('/api/admin/shop-page', shopPageRoutes.adminRouter);
app.use('/api/events-page', eventsPageRoutes.publicRouter);
app.use('/api/admin/events-page', eventsPageRoutes.adminRouter);

app.use('/api/contact-page', contactPageRoutes.publicRouter);
app.use('/api/admin/contact-page', contactPageRoutes.adminRouter);
app.use('/api/blogs-page', blogsPageRoutes.publicRouter);
app.use('/api/admin/blogs-page', blogsPageRoutes.adminRouter);
app.use('/api/about-page', aboutPageRoutes.publicRouter);
app.use('/api/admin/about-page', aboutPageRoutes.adminRouter);

app.use('/api/footer-settings', footerSettingsRoutes.publicRouter);
app.use('/api/admin/footer-settings', footerSettingsRoutes.adminRouter);

app.use('/api/policies', policiesRoutes.publicRouter);
app.use('/api/admin/policies', policiesRoutes.adminRouter);

// Verify SMTP connection on startup
emailService.verifyConnection();

// Initialize Delhivery tracking sync scheduler
const trackingScheduler = require("./services/tracking.scheduler");
// trackingScheduler.initScheduler(); // Disabled in favor of event-triggered synchronization

app.get("/api", (req, res) => {
  res.send("Welcome to the Fabric Luxure API");
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message });
});

module.exports = app