const ConnectDB = require("../../config/db");

// Get Sidebar Data
const getSidebarData = async () => {
  // 1. Fetch Product Types with first available category image (exclude deleted)
  const productTypesQuery = `
    SELECT pt.pro_type_id as id, pt.product_type as name, 
           (SELECT pc.category_img FROM product_category pc WHERE pc.pro_type_id = pt.pro_type_id AND (pc.is_deleted = 0 OR pc.is_deleted IS NULL) AND pc.is_active = 1 LIMIT 1) as imgUrl
    FROM product_type pt
    WHERE (pt.is_deleted = 0 OR pt.is_deleted IS NULL) AND pt.is_active = 1
  `;
  const [productTypes] = await ConnectDB.execute(productTypesQuery);

  // 2. Fetch Categories (exclude deleted)
  const categoriesQuery = `
    SELECT cat_id as id, pro_type_id as productTypeId, category_name as name, category_img as imgUrl
    FROM product_category
    WHERE (is_deleted = 0 OR is_deleted IS NULL) AND is_active = 1
  `;
  const [categories] = await ConnectDB.execute(categoriesQuery);

  // 3. Fetch Products (Limit 20 for initial view)
  const productsQuery = `
    SELECT pm.pro_id as id, pm.cat_id as categoryId, pc.pro_type_id as productTypeId, 
           pm.pro_name as title, pm.pro_img as imgUrl, pm.price, pm.cover_description as 'desc', pt.product_type as product_type_name
    FROM product_master pm
    LEFT JOIN product_category pc ON pm.cat_id = pc.cat_id
    LEFT JOIN product_type pt ON pc.pro_type_id = pt.pro_type_id
    WHERE (pm.is_deleted = 0 OR pm.is_deleted IS NULL)
      AND pm.is_active = 1
      AND pc.is_active = 1
      AND pt.is_active = 1
    ORDER BY pm.pro_id DESC
  `;
  const [products] = await ConnectDB.execute(productsQuery);

  // 4. Fetch 6 master filters
  const [fabricTypes] = await ConnectDB.execute(`SELECT fabric_type_id as id, fabric_type_name as name FROM fabric_type_master WHERE is_active = 1`);
  const [origins] = await ConnectDB.execute(`SELECT origin_id as id, origin_name as name FROM origin_master WHERE is_active = 1`);
  const [styles] = await ConnectDB.execute(`SELECT style_id as id, style_name as name FROM style_master WHERE is_active = 1`);
  const [weaves] = await ConnectDB.execute(`SELECT weave_id as id, weave_name as name FROM weave_master WHERE is_active = 1`);
  const [colors] = await ConnectDB.execute(`SELECT color_id as id, color_name as name, color_code FROM color_master WHERE is_active = 1`);
  const [patterns] = await ConnectDB.execute(`SELECT pattern_id as id, pattern_name as name FROM pattern_master WHERE is_active = 1`);

  return { 
    productTypes, 
    categories, 
    products, 
    filters: {
      fabricTypes,
      origins,
      styles,
      weaves,
      colors,
      patterns
    }
  };
};

// Get Live Suggestions
const getLiveSuggestions = async (searchQuery) => {
  if (!searchQuery || searchQuery.trim() === '') {
    return [];
  }
  
  const q = `%${searchQuery.trim().toLowerCase()}%`;

  const query = `
    SELECT DISTINCT pm.pro_id as id, pm.cat_id as categoryId, pc.pro_type_id as productTypeId, 
           pm.pro_name as title, pm.pro_img as imgUrl, pm.price, pm.cover_description as 'desc', pt.product_type as product_type_name
    FROM product_master pm
    LEFT JOIN product_category pc ON pm.cat_id = pc.cat_id
    LEFT JOIN product_type pt ON pc.pro_type_id = pt.pro_type_id
    LEFT JOIN product_descriptions pd ON pm.pro_id = pd.pro_id
    WHERE (pm.is_deleted = 0 OR pm.is_deleted IS NULL)
      AND pm.is_active = 1
      AND pc.is_active = 1
      AND pt.is_active = 1
      AND (
        LOWER(pm.pro_name) LIKE ? OR
        LOWER(pm.cover_description) LIKE ? OR
        LOWER(pc.category_name) LIKE ? OR
        LOWER(pt.product_type) LIKE ? OR
        LOWER(pd.desc_text) LIKE ? OR
        LOWER(pd.desc_title) LIKE ?
      )
    ORDER BY pm.pro_id DESC
    LIMIT 20
  `;
  
  const [products] = await ConnectDB.execute(query, [q, q, q, q, q, q]);
  return products;
};

module.exports = {
  getSidebarData,
  getLiveSuggestions
};
