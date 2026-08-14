const ConnectDB = require("../../config/db");

// ========================
// Get All Active Products
// ========================
const getAllProducts = async () => {
  const query = `
    SELECT pm.*, pc.category_name, pt.product_type AS product_type_name, pt.pro_type_id,
           pm.fabric_type_id, pm.origin_id, pm.style_id, pm.weave_id, pm.color_id, pm.pattern_id, pm.standard_size
    FROM product_master pm
    LEFT JOIN product_category pc ON pm.cat_id = pc.cat_id
    LEFT JOIN product_type pt ON pc.pro_type_id = pt.pro_type_id
    WHERE pm.is_deleted = 0 OR pm.is_deleted IS NULL
    ORDER BY pm.pro_id DESC
  `;
  const [rows] = await ConnectDB.execute(query);
  if (rows.length === 0) return [];

  // Fetch all child data to map in memory
  const [descriptions] = await ConnectDB.execute(`SELECT * FROM product_descriptions ORDER BY desc_number ASC`);
  const [specs] = await ConnectDB.execute(`SELECT * FROM specifications ORDER BY spec_number ASC`);
  const [images] = await ConnectDB.execute(`SELECT * FROM product_images ORDER BY order_number ASC`);

  const descLookup = {};
  descriptions.forEach((d) => {
    if (!descLookup[d.pro_id]) descLookup[d.pro_id] = [];
    descLookup[d.pro_id].push({
      title: d.desc_title,
      text: d.desc_text,
      number: d.desc_number
    });
  });

  const specLookup = {};
  specs.forEach((s) => {
    if (!specLookup[s.pro_id]) specLookup[s.pro_id] = [];
    const parts = s.spec_desc.split(":");
    const key = parts[0]?.trim() || "";
    const value = parts.slice(1).join(":").trim() || "";
    specLookup[s.pro_id].push({ key, value });
  });

  const imageLookup = {};
  images.forEach((img) => {
    if (!imageLookup[img.pro_id]) imageLookup[img.pro_id] = [];
    imageLookup[img.pro_id].push(img.images);
  });

  return rows.map((r) => ({
    pro_id: r.pro_id,
    cat_id: r.cat_id,
    pro_name: r.pro_name,
    price: Number(r.price),
    pro_img: r.pro_img,
    cover_description: r.cover_description,
    is_top_pics: r.is_top_pics,
    is_exclusive: r.is_exclusive,
    category_name: r.category_name || "Ready to wear",
    product_type_name: r.product_type_name || "Shirt",
    pro_type_id: r.pro_type_id,
    fabric_type_id: r.fabric_type_id,
    origin_id: r.origin_id,
    style_id: r.style_id,
    weave_id: r.weave_id,
    color_id: r.color_id,
    pattern_id: r.pattern_id,
    standard_size: r.standard_size,
    descriptions: descLookup[r.pro_id] || [],
    specifications: specLookup[r.pro_id] || [],
    additionalImages: imageLookup[r.pro_id] || [],
    stock_quantity: r.stock_quantity !== null && r.stock_quantity !== undefined ? Number(r.stock_quantity) : 0,
    stock_unit: r.stock_unit || 'PCS',
    stitching_price: r.stitching_price !== null && r.stitching_price !== undefined ? Number(r.stitching_price) : null,
    is_active: r.is_active,
    disclaimer: r.disclaimer
  }));
};

// ========================
// Search Products (Dynamic Filters)
// ========================
const searchProducts = async (filters) => {
  let query = `
    SELECT DISTINCT pm.pro_id, pm.cat_id, pc.category_name, pt.product_type AS product_type_name, pt.pro_type_id,
           pm.pro_name, pm.price, pm.pro_img, pm.cover_description, pm.is_top_pics, pm.is_exclusive,
           pm.fabric_type_id, pm.origin_id, pm.style_id, pm.weave_id, pm.color_id, pm.pattern_id, pm.standard_size, pm.stock_quantity, pm.stock_unit, pm.disclaimer
    FROM product_master pm
    LEFT JOIN product_category pc ON pm.cat_id = pc.cat_id
    LEFT JOIN product_type pt ON pc.pro_type_id = pt.pro_type_id
    LEFT JOIN product_descriptions pd ON pm.pro_id = pd.pro_id
    WHERE (pm.is_deleted = 0 OR pm.is_deleted IS NULL)
      AND pm.is_active = 1
      AND pc.is_active = 1
      AND pt.is_active = 1
  `;
  const params = [];

  if (filters.productType) {
    query += ` AND pt.pro_type_id = ?`;
    params.push(filters.productType);
  }
  if (filters.category) {
    query += ` AND pm.cat_id = ?`;
    params.push(filters.category);
  }
  if (filters.fabric) {
    query += ` AND pm.fabric_type_id = ?`;
    params.push(filters.fabric);
  }
  if (filters.origin) {
    query += ` AND pm.origin_id = ?`;
    params.push(filters.origin);
  }
  if (filters.style) {
    query += ` AND pm.style_id = ?`;
    params.push(filters.style);
  }
  if (filters.weave) {
    query += ` AND pm.weave_id = ?`;
    params.push(filters.weave);
  }
  if (filters.color) {
    query += ` AND pm.color_id = ?`;
    params.push(filters.color);
  }
  if (filters.pattern) {
    query += ` AND pm.pattern_id = ?`;
    params.push(filters.pattern);
  }
  if (filters.search) {
    query += ` AND (
      LOWER(pm.pro_name) LIKE ? OR 
      LOWER(pm.cover_description) LIKE ? OR 
      LOWER(pc.category_name) LIKE ? OR 
      LOWER(pt.product_type) LIKE ? OR 
      LOWER(pd.desc_text) LIKE ? OR 
      LOWER(pd.desc_title) LIKE ?
    )`;
    const s = `%${filters.search.toLowerCase()}%`;
    params.push(s, s, s, s, s, s);
  }

  query += ` ORDER BY pm.pro_id DESC`;

  const [rows] = await ConnectDB.execute(query, params);
  if (rows.length === 0) return [];

  // Fetch all child data to map in memory
  const [descriptions] = await ConnectDB.execute(`SELECT * FROM product_descriptions ORDER BY desc_number ASC`);
  const [specs] = await ConnectDB.execute(`SELECT * FROM specifications ORDER BY spec_number ASC`);
  const [images] = await ConnectDB.execute(`SELECT * FROM product_images ORDER BY order_number ASC`);

  const descLookup = {};
  descriptions.forEach((d) => {
    if (!descLookup[d.pro_id]) descLookup[d.pro_id] = [];
    descLookup[d.pro_id].push({ title: d.desc_title, text: d.desc_text, number: d.desc_number });
  });

  const specLookup = {};
  specs.forEach((s) => {
    if (!specLookup[s.pro_id]) specLookup[s.pro_id] = [];
    const parts = s.spec_desc.split(":");
    const key = parts[0]?.trim() || "";
    const value = parts.slice(1).join(":").trim() || "";
    specLookup[s.pro_id].push({ key, value });
  });

  const imageLookup = {};
  images.forEach((img) => {
    if (!imageLookup[img.pro_id]) imageLookup[img.pro_id] = [];
    imageLookup[img.pro_id].push(img.images);
  });

  return rows.map((r) => ({
    pro_id: r.pro_id,
    cat_id: r.cat_id,
    pro_name: r.pro_name,
    price: Number(r.price),
    pro_img: r.pro_img,
    cover_description: r.cover_description,
    is_top_pics: r.is_top_pics,
    is_exclusive: r.is_exclusive,
    category_name: r.category_name || "Ready to wear",
    product_type_name: r.product_type_name || "Shirt",
    pro_type_id: r.pro_type_id,
    fabric_type_id: r.fabric_type_id,
    origin_id: r.origin_id,
    style_id: r.style_id,
    weave_id: r.weave_id,
    color_id: r.color_id,
    pattern_id: r.pattern_id,
    standard_size: r.standard_size,
    descriptions: descLookup[r.pro_id] || [],
    specifications: specLookup[r.pro_id] || [],
    additionalImages: imageLookup[r.pro_id] || [],
    stock_quantity: r.stock_quantity !== null && r.stock_quantity !== undefined ? Number(r.stock_quantity) : 0,
    stock_unit: r.stock_unit || 'PCS',
    stitching_price: r.stitching_price !== null ? Number(r.stitching_price) : null,
    disclaimer: r.disclaimer
  }));
};

// ========================
// Get Product By ID
// ========================
const getProductById = async (id) => {
  const query = `
    SELECT pm.*, pc.category_name, pt.product_type AS product_type_name, pt.pro_type_id,
           sct.template_id, sct.template_name, sct.image_path,
           pm.fabric_type_id, pm.origin_id, pm.style_id, pm.weave_id, pm.color_id, pm.pattern_id, pm.standard_size
    FROM product_master pm
    LEFT JOIN product_category pc ON pm.cat_id = pc.cat_id
    LEFT JOIN product_type pt ON pc.pro_type_id = pt.pro_type_id
    LEFT JOIN size_chart_templates sct ON pt.pro_type_id = sct.pro_type_id AND sct.is_active = 1
    WHERE pm.pro_id = ? AND (pm.is_deleted = 0 OR pm.is_deleted IS NULL)
  `;
  const [rows] = await ConnectDB.execute(query, [id]);
  if (rows.length === 0) return null;

  const r = rows[0];

  const [descriptions] = await ConnectDB.execute(
    `SELECT * FROM product_descriptions WHERE pro_id = ? ORDER BY desc_number ASC`,
    [id]
  );
  const [specs] = await ConnectDB.execute(
    `SELECT * FROM specifications WHERE pro_id = ? ORDER BY spec_number ASC`,
    [id]
  );
  const [images] = await ConnectDB.execute(
    `SELECT * FROM product_images WHERE pro_id = ? ORDER BY order_number ASC`,
    [id]
  );

  const size_chart_template = r.template_id ? {
    template_id: r.template_id,
    template_name: r.template_name,
    image_path: r.image_path
  } : null;

  return {
    pro_id: r.pro_id,
    cat_id: r.cat_id,
    pro_name: r.pro_name,
    price: Number(r.price),
    pro_img: r.pro_img,
    cover_description: r.cover_description,
    is_top_pics: r.is_top_pics,
    is_exclusive: r.is_exclusive,
    category_name: r.category_name || "Ready to wear",
    product_type_name: r.product_type_name || "Shirt",
    pro_type_id: r.pro_type_id,
    fabric_type_id: r.fabric_type_id,
    origin_id: r.origin_id,
    style_id: r.style_id,
    weave_id: r.weave_id,
    color_id: r.color_id,
    pattern_id: r.pattern_id,
    standard_size: r.standard_size,
    stock_quantity: r.stock_quantity !== null && r.stock_quantity !== undefined ? Number(r.stock_quantity) : 0,
    stock_unit: r.stock_unit || 'PCS',
    stitching_price: r.stitching_price !== null ? Number(r.stitching_price) : null,
    is_active: r.is_active,
    disclaimer: r.disclaimer,
    descriptions: descriptions.map((d) => ({
      title: d.desc_title,
      text: d.desc_text,
      number: d.desc_number
    })),
    specifications: specs.map((s) => {
      const parts = s.spec_desc.split(":");
      const key = parts[0]?.trim() || "";
      const value = parts.slice(1).join(":").trim() || "";
      return { key, value };
    }),
    additionalImages: images.map((img) => img.images),
    size_chart_template
  };
};

// ========================
// Get Product By Name & Category
// ========================
const getProductByNameAndCategory = async (name, catId) => {
  const query = `
    SELECT *
    FROM product_master
    WHERE LOWER(TRIM(pro_name)) = LOWER(TRIM(?)) AND cat_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
  `;
  const [rows] = await ConnectDB.execute(query, [name, catId]);
  return rows.length > 0 ? rows[0] : null;
};

// ========================
// Create Product
// ========================
const createProduct = async (productData) => {
  const {
    cat_id,
    pro_name,
    price,
    stock_quantity,
    stock_unit,
    pro_img,
    cover_description,
    is_top_pics,
    is_exclusive,
    fabric_type_id,
    origin_id,
    style_id,
    weave_id,
    color_id,
    pattern_id,
    standard_size,
    descriptions,
    specifications,
    additionalImages,
    stitching_price,
    disclaimer,
  } = productData;

  const query = `
    INSERT INTO product_master (
      cat_id, pro_name, price, stock_quantity, stock_unit, pro_img, cover_description, is_top_pics, is_exclusive, 
      fabric_type_id, origin_id, style_id, weave_id, color_id, pattern_id, standard_size, stitching_price, disclaimer,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
  `;
  const [result] = await ConnectDB.execute(query, [
    cat_id,
    pro_name,
    price,
    stock_quantity,
    stock_unit,
    pro_img,
    cover_description || "",
    is_top_pics ? 1 : 0,
    is_exclusive ? 1 : 0,
    fabric_type_id || null,
    origin_id || null,
    style_id || null,
    weave_id || null,
    color_id || null,
    pattern_id || null,
    standard_size || null,
    stitching_price !== undefined && stitching_price !== null && stitching_price !== "" ? parseFloat(stitching_price) : null,
    disclaimer || null,
  ]);
  const pro_id = result.insertId;

  // Insert Descriptions
  if (descriptions && descriptions.length > 0) {
    for (let i = 0; i < descriptions.length; i++) {
      const desc = descriptions[i];
      const descTitle = desc.title || null;
      const descText = desc.text || "";
      const descNumber = desc.number || (i + 1);
      await ConnectDB.execute(
        `INSERT INTO product_descriptions (pro_id, desc_title, desc_text, desc_number) VALUES (?, ?, ?, ?)`,
        [pro_id, descTitle, descText, descNumber]
      );
    }
  }

  // Insert Specifications
  if (specifications && specifications.length > 0) {
    for (let i = 0; i < specifications.length; i++) {
      const { key, value } = specifications[i];
      const combined = `${key}: ${value}`;
      await ConnectDB.execute(
        `INSERT INTO specifications (pro_id, spec_desc, spec_number, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())`,
        [pro_id, combined, i + 1]
      );
    }
  }

  // Insert Additional Images
  if (additionalImages && additionalImages.length > 0) {
    for (let i = 0; i < additionalImages.length; i++) {
      await ConnectDB.execute(
        `INSERT INTO product_images (pro_id, images, order_number, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())`,
        [pro_id, additionalImages[i], i + 1]
      );
    }
  }

  return getProductById(pro_id);
};

// ========================
// Update Product
// ========================
const updateProduct = async (id, productData) => {
  const {
    cat_id,
    pro_name,
    price,
    stock_quantity,
    stock_unit,
    pro_img,
    cover_description,
    is_top_pics,
    is_exclusive,
    fabric_type_id,
    origin_id,
    style_id,
    weave_id,
    color_id,
    pattern_id,
    standard_size,
    descriptions,
    specifications,
    additionalImages,
    stitching_price,
    disclaimer
  } = productData;

  const query = `
    UPDATE product_master
    SET cat_id = ?, pro_name = ?, price = ?, stock_quantity = ?, stock_unit = ?, pro_img = ?, cover_description = ?, is_top_pics = ?, is_exclusive = ?, 
        fabric_type_id = ?, origin_id = ?, style_id = ?, weave_id = ?, color_id = ?, pattern_id = ?, standard_size = ?, stitching_price = ?, disclaimer = ?, updated_at = NOW()
    WHERE pro_id = ?
  `;
  await ConnectDB.execute(query, [
    cat_id,
    pro_name,
    price,
    stock_quantity,
    stock_unit,
    pro_img,
    cover_description || "",
    is_top_pics ? 1 : 0,
    is_exclusive ? 1 : 0,
    fabric_type_id || null,
    origin_id || null,
    style_id || null,
    weave_id || null,
    color_id || null,
    pattern_id || null,
    standard_size || null,
    stitching_price !== undefined && stitching_price !== null && stitching_price !== "" ? parseFloat(stitching_price) : null,
    disclaimer || null,
    id,
  ]);

  // Clean old child records
  await ConnectDB.execute(`DELETE FROM product_descriptions WHERE pro_id = ?`, [id]);
  await ConnectDB.execute(`DELETE FROM specifications WHERE pro_id = ?`, [id]);
  await ConnectDB.execute(`DELETE FROM product_images WHERE pro_id = ?`, [id]);

  // Re-insert Descriptions
  if (descriptions && descriptions.length > 0) {
    for (let i = 0; i < descriptions.length; i++) {
      const desc = descriptions[i];
      const descTitle = desc.title || null;
      const descText = desc.text || "";
      const descNumber = desc.number || (i + 1);
      await ConnectDB.execute(
        `INSERT INTO product_descriptions (pro_id, desc_title, desc_text, desc_number) VALUES (?, ?, ?, ?)`,
        [id, descTitle, descText, descNumber]
      );
    }
  }

  // Re-insert Specifications
  if (specifications && specifications.length > 0) {
    for (let i = 0; i < specifications.length; i++) {
      const { key, value } = specifications[i];
      const combined = `${key}: ${value}`;
      await ConnectDB.execute(
        `INSERT INTO specifications (pro_id, spec_desc, spec_number, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())`,
        [id, combined, i + 1]
      );
    }
  }

  // Re-insert Additional Images
  if (additionalImages && additionalImages.length > 0) {
    for (let i = 0; i < additionalImages.length; i++) {
      await ConnectDB.execute(
        `INSERT INTO product_images (pro_id, images, order_number, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())`,
        [id, additionalImages[i], i + 1]
      );
    }
  }

  return getProductById(id);
};

// ========================
// Soft Delete Product
// ========================
const deleteProduct = async (id) => {
  const query = `
    UPDATE product_master
    SET is_deleted = 1, deleted_at = NOW()
    WHERE pro_id = ?
  `;
  const [result] = await ConnectDB.execute(query, [id]);
  return result.affectedRows > 0;
};

// ========================
// Toggle Product Status
// ========================
const toggleProductStatus = async (id, status) => {
  const query = `
    UPDATE product_master
    SET is_active = ?
    WHERE pro_id = ?
  `;
  const [result] = await ConnectDB.execute(query, [status, id]);
  return result.affectedRows > 0;
};

const updateProductFlags = async (id, flags) => {
  const { is_top_pics, is_exclusive } = flags;
  
  let query = "UPDATE product_master SET ";
  const params = [];
  
  if (is_top_pics !== undefined) {
    query += "is_top_pics = ?, ";
    params.push(is_top_pics === "true" || is_top_pics === true || is_top_pics === 1 || is_top_pics === "1" ? 1 : 0);
  }
  
  if (is_exclusive !== undefined) {
    query += "is_exclusive = ?, ";
    params.push(is_exclusive === "true" || is_exclusive === true || is_exclusive === 1 || is_exclusive === "1" ? 1 : 0);
  }
  
  // Strip trailing comma
  query = query.slice(0, -2);
  query += " WHERE pro_id = ?";
  params.push(id);
  
  await ConnectDB.execute(query, params);
  return getProductById(id);
};

// ========================
// Update Product Stock
// ========================
const updateProductStock = async (id, stock_quantity) => {
  const query = `UPDATE product_master SET stock_quantity = ?, updated_at = NOW() WHERE pro_id = ?`;
  const [result] = await ConnectDB.execute(query, [stock_quantity, id]);
  return result.affectedRows > 0;
};

module.exports = {
  getAllProducts,
  getProductById,
  getProductByNameAndCategory,
  createProduct,
  updateProduct,
  updateProductFlags,
  updateProductStock,
  deleteProduct,
  toggleProductStatus,
  searchProducts,
};
