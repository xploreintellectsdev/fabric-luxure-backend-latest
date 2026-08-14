const express = require("express");
const blogsController = require("./blogs.controller");
const createUploader = require("../../middleware/multerConfig");

const upload = createUploader("blogs");

// Admin Router
const adminRouter = express.Router();
adminRouter.get("/", blogsController.getBlogs);
adminRouter.get("/:id", blogsController.getBlogById);
adminRouter.post("/", upload.single("blog_image"), blogsController.createBlog);
adminRouter.put("/:id", upload.single("blog_image"), blogsController.updateBlog);
adminRouter.delete("/:id", blogsController.deleteBlog);

// Public Router
const publicRouter = express.Router();
// Public router only returns active blogs
publicRouter.get("/", (req, res, next) => {
  req.isPublicRoute = true;
  return blogsController.getBlogs(req, res, next);
});

publicRouter.get("/:id", blogsController.getBlogById);

module.exports = {
  adminRouter,
  publicRouter
};
