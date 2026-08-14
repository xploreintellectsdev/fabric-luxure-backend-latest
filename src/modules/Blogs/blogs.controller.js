const blogsService = require("./blogs.service");

const getBlogs = async (req, res) => {
  try {
    const { search = "", sort = "order_no", order = "ASC", page = 1, limit = 10 } = req.query;
    const status = req.isPublicRoute ? "true" : (req.query.status || "");
    const offset = (Number(page) - 1) * Number(limit);
    const data = await blogsService.getBlogs(search, sort, order, Number(limit), offset, status);
    
    return res.status(200).json({
      success: true,
      data: data.rows,
      total: data.total
    });
  } catch (error) {
    console.error("Get Blogs Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const getBlogById = async (req, res) => {
  try {
    const blog = await blogsService.getBlogById(req.params.id);
    if (!blog) return res.status(404).json({ success: false, error: "Blog not found" });
    return res.status(200).json({ success: true, data: blog });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

const createBlog = async (req, res) => {
  try {
    const { order_no, published_date, blog_title, short_description, blog_content, is_active } = req.body;
    let blog_image = "";
    if (req.file) {
      blog_image = `/uploads/blogs/${req.file.filename}`;
    }

    if (!blog_image) {
      return res.status(400).json({ success: false, error: "Blog image is required." });
    }

    const insertId = await blogsService.createBlog({
      order_no,
      published_date,
      blog_title,
      blog_image,
      short_description,
      blog_content,
      is_active: is_active === "true" || is_active === true ? 1 : 0
    });

    return res.status(201).json({ success: true, message: "Blog created successfully.", data: { blog_id: insertId } });
  } catch (error) {
    console.error("Create Blog Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const updateBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const { order_no, published_date, blog_title, short_description, blog_content, is_active } = req.body;
    
    let blog_image = null;
    if (req.file) {
      blog_image = `/uploads/blogs/${req.file.filename}`;
    }

    const success = await blogsService.updateBlog(id, {
      order_no,
      published_date,
      blog_title,
      blog_image,
      short_description,
      blog_content,
      is_active: is_active === "true" || is_active === true || is_active === 1 || is_active === "1" ? 1 : 0
    });

    if (!success) return res.status(404).json({ success: false, error: "Blog not found." });

    return res.status(200).json({ success: true, message: "Blog updated successfully." });
  } catch (error) {
    console.error("Update Blog Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const deleteBlog = async (req, res) => {
  try {
    const success = await blogsService.deleteBlog(req.params.id);
    if (!success) return res.status(404).json({ success: false, error: "Blog not found." });
    return res.status(200).json({ success: true, message: "Blog deleted successfully." });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getBlogs,
  getBlogById,
  createBlog,
  updateBlog,
  deleteBlog
};
