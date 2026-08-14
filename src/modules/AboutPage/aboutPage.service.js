const ConnectDB = require("../../config/db");

const getAboutHero = async (isPublicRoute = false) => {
  const connection = await ConnectDB.getConnection();
  try {
    const query = isPublicRoute
      ? "SELECT * FROM about_hero WHERE section_key = 'about_hero' AND is_enabled = 1"
      : "SELECT * FROM about_hero WHERE section_key = 'about_hero'";
    const [rows] = await connection.query(query);

    if (rows.length === 0) {
      if (isPublicRoute) {
        return null;
      }

      // Seed default record if it doesn't exist
      const defaultData = {
        section_key: "about_hero",
        section_name: "ABOUT HERO SECTION",
        is_enabled: 1,
        hero_image: "/images/about-us/about1.webp",
        title_line_1: "Made To Be Worn, Remembered,",
        title_line_2: "And Chosen Again",
        section_description: "A well-chosen fabric stays with you through countless moments. Our collections are thoughtfully selected for men who appreciate refined dressing and lasting value in every wardrobe.",
        section_order: 1
      };

      const [insertResult] = await connection.query(`
        INSERT INTO about_hero 
        (section_key, section_name, is_enabled, hero_image, title_line_1, title_line_2, section_description, section_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        defaultData.section_key, defaultData.section_name, defaultData.is_enabled,
        defaultData.hero_image, defaultData.title_line_1, defaultData.title_line_2,
        defaultData.section_description, defaultData.section_order
      ]);

      defaultData.about_hero_id = insertResult.insertId;
      return defaultData;
    }

    return rows[0];
  } finally {
    connection.release();
  }
};

const updateAboutHero = async (data) => {
  const connection = await ConnectDB.getConnection();
  try {
    const { is_enabled, hero_image, title_line_1, title_line_2, section_description } = data;

    // First ensure record exists
    const [existing] = await connection.query("SELECT * FROM about_hero WHERE section_key = 'about_hero'");
    if (existing.length === 0) {
      await getAboutHero(false); // Seed it
    }

    const updates = [];
    const queryParams = [];

    if (is_enabled !== undefined) {
      updates.push("is_enabled = ?");
      queryParams.push(Number(is_enabled));
    }
    if (hero_image !== undefined) {
      updates.push("hero_image = ?");
      queryParams.push(hero_image);
    }
    if (title_line_1 !== undefined) {
      updates.push("title_line_1 = ?");
      queryParams.push(title_line_1);
    }
    if (title_line_2 !== undefined) {
      updates.push("title_line_2 = ?");
      queryParams.push(title_line_2);
    }
    if (section_description !== undefined) {
      updates.push("section_description = ?");
      queryParams.push(section_description);
    }

    if (updates.length > 0) {
      queryParams.push('about_hero');
      await connection.query(
        `UPDATE about_hero SET ${updates.join(", ")} WHERE section_key = ?`,
        queryParams
      );
    }

    return await getAboutHero(false);
  } finally {
    connection.release();
  }
};

const getWhereItBegan = async (isPublicRoute = false) => {
  const connection = await ConnectDB.getConnection();
  try {
    const query = isPublicRoute
      ? "SELECT * FROM about_where_it_began WHERE section_key = 'about_where_it_began' AND is_enabled = 1"
      : "SELECT * FROM about_where_it_began WHERE section_key = 'about_where_it_began'";
    const [rows] = await connection.query(query);

    if (rows.length === 0) {
      if (isPublicRoute) return null;

      const defaultData = {
        section_key: "about_where_it_began",
        section_name: "WHERE IT BEGAN",
        is_enabled: 1,
        image_path: "/images/about-us/where-it-begin.webp",
        heading: "WHERE IT BEGAN?",
        heading_enabled: 1,
        title: "Built On A Simple Belief",
        title_enabled: 1,
        quote: "\"Good clothing begins long before the first stitch. It begins with choosing the right fabric. That idea inspired everything we do at Fabric Luxure.\"",
        quote_enabled: 1,
        paragraph_1: "Fabric Luxure was created with one purpose: to make choosing fabric easier and more meaningful. We understand that every customer looks for something different, whether it's for work, family occasions, or everyday wear. That's why we focus on carefully selected collections that combine timeless style with dependable quality.",
        paragraph_1_enabled: 1,
        paragraph_2: "Every fabric we offer represents our commitment to thoughtful choices, honest work, and lasting relationships with the people who trust our brand.",
        paragraph_2_enabled: 1,
        paragraph_3: "From premium cotton and linen blends to modern printed collections, we ensure every fabric is selected for its comfort, durability, and refined finish.",
        paragraph_3_enabled: 1,
        section_order: 1
      };

      const [insertResult] = await connection.query(`
        INSERT INTO about_where_it_began 
        (section_key, section_name, is_enabled, image_path, heading, heading_enabled, title, title_enabled, quote, quote_enabled, paragraph_1, paragraph_1_enabled, paragraph_2, paragraph_2_enabled, paragraph_3, paragraph_3_enabled, section_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        defaultData.section_key, defaultData.section_name, defaultData.is_enabled, defaultData.image_path,
        defaultData.heading, defaultData.heading_enabled, defaultData.title, defaultData.title_enabled,
        defaultData.quote, defaultData.quote_enabled, defaultData.paragraph_1, defaultData.paragraph_1_enabled,
        defaultData.paragraph_2, defaultData.paragraph_2_enabled, defaultData.paragraph_3, defaultData.paragraph_3_enabled,
        defaultData.section_order
      ]);

      defaultData.where_it_began_id = insertResult.insertId;
      return defaultData;
    }
    return rows[0];
  } finally {
    connection.release();
  }
};

const updateWhereItBegan = async (data) => {
  const connection = await ConnectDB.getConnection();
  try {
    const fields = [
      "is_enabled", "image_path", "heading", "heading_enabled",
      "title", "title_enabled", "quote", "quote_enabled",
      "paragraph_1", "paragraph_1_enabled", "paragraph_2", "paragraph_2_enabled",
      "paragraph_3", "paragraph_3_enabled"
    ];

    const updates = [];
    const queryParams = [];

    // Ensure record exists
    const [existing] = await connection.query("SELECT * FROM about_where_it_began WHERE section_key = 'about_where_it_began'");
    if (existing.length === 0) {
      await getWhereItBegan(false);
    }

    fields.forEach(field => {
      if (data[field] !== undefined) {
        updates.push(`${field} = ?`);
        // handle booleans encoded as strings "true"/"false" or "1"/"0"
        let val = data[field];
        if (field.endsWith("_enabled") || field === "is_enabled") {
          val = (val === 'true' || val === true || val === '1' || val === 1) ? 1 : 0;
        }
        queryParams.push(val);
      }
    });

    if (updates.length > 0) {
      queryParams.push('about_where_it_began');
      await connection.query(
        `UPDATE about_where_it_began SET ${updates.join(", ")} WHERE section_key = ?`,
        queryParams
      );
    }

    return await getWhereItBegan(false);
  } finally {
    connection.release();
  }
};

const getWhatWeStandFor = async (isPublicRoute = false) => {
  const connection = await ConnectDB.getConnection();
  try {
    const query = isPublicRoute
      ? "SELECT * FROM about_what_we_stand_for WHERE section_enabled = 1"
      : "SELECT * FROM about_what_we_stand_for LIMIT 1";
    const [rows] = await connection.query(query);

    if (rows.length === 0) {
      if (isPublicRoute) return null;

      const defaultData = {
        section_enabled: 1,
        heading_line_1: "WHAT WE STAND FOR",
        heading_line_1_enabled: 1,
        heading_line_2: "Six Things We Will Never Compromise On",
        heading_line_2_enabled: 1,
        card_1_enabled: 1,
        card_1_title: "Carefully Chosen Fabrics",
        card_1_content: "We believe a great shirt starts with the right fabric . Every collection is selected for its look , feel , and everyday performance , helping you choose with confidence .",
        card_2_enabled: 1,
        card_2_title: "Timeless Style",
        card_2_content: "Trends come and go , but good style always stays . Our fabrics are chosen to suit every occasion , making them easy to wear today and for years to come .",
        card_3_enabled: 1,
        card_3_title: "Attention To Every Detail",
        card_3_content: "From fabric selection to the final finish , every detail matters . We believe small details create a better experience every time you wear our fabrics .",
        card_4_enabled: 1,
        card_4_title: "Made For Everyday Wear",
        card_4_content: "Your shirt should never stay in the wardrobe . Our fabrics are selected to suit everyday life , offering a balance of appearance , ease , and reliability .",
        card_5_enabled: 1,
        card_5_title: "Honest Fabric Selection",
        card_5_content: "We don't believe in confusing choices or unnecessary claims . We focus on offering fabrics that are carefully selected , clearly presented , and worth your trust .",
        card_6_enabled: 1,
        card_6_title: "Relationships Before Sales",
        card_6_content: "Every order is the beginning of a relationship . We value every customer by offering honest guidance , dependable service , and fabrics you can confidently choose again .",
        section_order: 1
      };

      const fields = Object.keys(defaultData).join(', ');
      const placeholders = Object.keys(defaultData).map(() => '?').join(', ');
      const values = Object.values(defaultData);

      const [insertResult] = await connection.query(`
        INSERT INTO about_what_we_stand_for (${fields})
        VALUES (${placeholders})
      `, values);

      defaultData.what_we_stand_for_id = insertResult.insertId;
      return defaultData;
    }
    return rows[0];
  } finally {
    connection.release();
  }
};

const updateWhatWeStandFor = async (data) => {
  const connection = await ConnectDB.getConnection();
  try {
    const fields = [
      "section_enabled", "heading_line_1", "heading_line_1_enabled", "heading_line_2", "heading_line_2_enabled",
      "card_1_enabled", "card_1_title", "card_1_content",
      "card_2_enabled", "card_2_title", "card_2_content",
      "card_3_enabled", "card_3_title", "card_3_content",
      "card_4_enabled", "card_4_title", "card_4_content",
      "card_5_enabled", "card_5_title", "card_5_content",
      "card_6_enabled", "card_6_title", "card_6_content"
    ];

    const updates = [];
    const queryParams = [];

    const [existing] = await connection.query("SELECT * FROM about_what_we_stand_for LIMIT 1");
    if (existing.length === 0) {
      await getWhatWeStandFor(false);
    }
    const idToUpdate = existing.length > 0 ? existing[0].what_we_stand_for_id : (await getWhatWeStandFor(false)).what_we_stand_for_id;

    fields.forEach(field => {
      if (data[field] !== undefined) {
        updates.push(`${field} = ?`);
        let val = data[field];
        if (field.endsWith("_enabled") || field === "section_enabled") {
          val = (val === 'true' || val === true || val === '1' || val === 1) ? 1 : 0;
        }
        queryParams.push(val);
      }
    });

    if (updates.length > 0) {
      queryParams.push(idToUpdate);
      await connection.query(
        `UPDATE about_what_we_stand_for SET ${updates.join(", ")} WHERE what_we_stand_for_id = ?`,
        queryParams
      );
    }

    return await getWhatWeStandFor(false);
  } finally {
    connection.release();
  }
};

const getTheMaking = async (isPublicRoute = false) => {
  const connection = await ConnectDB.getConnection();
  try {
    const query = isPublicRoute
      ? "SELECT * FROM about_the_making WHERE section_enabled = 1"
      : "SELECT * FROM about_the_making LIMIT 1";
    const [rows] = await connection.query(query);

    if (rows.length === 0) {
      if (isPublicRoute) return null;

      const defaultData = {
        section_enabled: 1,
        section_image: "/images/about-us/the.webp",
        title_line_1: "The Making !",
        title_line_1_enabled: 1,
        title_line_2: "Where Style Begins",
        title_line_2_enabled: 1,
        paragraph_1: "A well-made shirt begins long before it is stitched. It starts with choosing fabrics that suit different lifestyles, seasons, and occasions. From lightweight linen to soft cotton blends, every collection at Fabric Luxure is selected to help you dress with confidence, no matter where the day takes you.",
        paragraph_1_enabled: 1,
        paragraph_2: "We focus on fabrics that offer the right balance of comfort, durability, and style, ensuring they look great while feeling comfortable throughout the day.",
        paragraph_2_enabled: 1,
        paragraph_3: "Our carefully curated collections provide consistent quality, elegant finishes, and versatile designs to meet a wide range of fashion needs.",
        paragraph_3_enabled: 1,
        tags: JSON.stringify([
          { text: "100% Linen", enabled: true },
          { text: "Linen Cotton", enabled: true },
          { text: "Pure Cotton", enabled: true },
          { text: "Cotton Blend", enabled: true },
          { text: "Everyday Wear", enabled: true },
          { text: "Formal Wear", enabled: true }
        ]),
        section_order: 1
      };

      const fields = Object.keys(defaultData).join(', ');
      const placeholders = Object.keys(defaultData).map(() => '?').join(', ');
      const values = Object.values(defaultData);

      const [insertResult] = await connection.query(`
        INSERT INTO about_the_making (${fields})
        VALUES (${placeholders})
      `, values);

      defaultData.about_the_making_id = insertResult.insertId;
      return defaultData;
    }
    return rows[0];
  } finally {
    connection.release();
  }
};

const updateTheMaking = async (data) => {
  const connection = await ConnectDB.getConnection();
  try {
    const fields = [
      "section_enabled", "section_image",
      "title_line_1", "title_line_1_enabled",
      "title_line_2", "title_line_2_enabled",
      "paragraph_1", "paragraph_1_enabled",
      "paragraph_2", "paragraph_2_enabled",
      "paragraph_3", "paragraph_3_enabled",
      "tags"
    ];

    const updates = [];
    const queryParams = [];

    const [existing] = await connection.query("SELECT * FROM about_the_making LIMIT 1");
    if (existing.length === 0) {
      await getTheMaking(false);
    }
    const idToUpdate = existing.length > 0 ? existing[0].about_the_making_id : (await getTheMaking(false)).about_the_making_id;

    fields.forEach(field => {
      if (data[field] !== undefined) {
        updates.push(`${field} = ?`);
        let val = data[field];
        if (field.endsWith("_enabled") || field === "section_enabled") {
          val = (val === 'true' || val === true || val === '1' || val === 1) ? 1 : 0;
        } else if (field === "tags" && typeof val !== 'string') {
          val = JSON.stringify(val);
        }
        queryParams.push(val);
      }
    });

    if (updates.length > 0) {
      queryParams.push(idToUpdate);
      await connection.query(
        `UPDATE about_the_making SET ${updates.join(", ")} WHERE about_the_making_id = ?`,
        queryParams
      );
    }

    return await getTheMaking(false);
  } finally {
    connection.release();
  }
};

const getThePeople = async (isPublicRoute = false) => {
  const connection = await ConnectDB.getConnection();
  try {
    const query = isPublicRoute
      ? "SELECT * FROM about_the_people WHERE section_key = 'about_the_people' AND is_enabled = 1"
      : "SELECT * FROM about_the_people WHERE section_key = 'about_the_people'";
    const [rows] = await connection.query(query);

    if (rows.length === 0) {
      if (isPublicRoute) return null;

      const defaultData = {
        section_key: "about_the_people",
        section_name: "THE PEOPLE",
        is_enabled: 1,
        section_image: "/images/about-us/thepeople.webp",
        title_line_1: "THE PEOPLE !",
        title_line_1_enabled: 1,
        title_line_2: "Driven by craftsmanship and quality",
        title_line_2_enabled: 1,
        content_paragraph_1: "Behind every Fabric Luxure creation is a team devoted to excellence in fabric innovation, precision tailoring, and customer satisfaction. From sourcing the finest European linen to meticulous design and finishing, our artisans work together to craft garments that embody sophistication, comfort, and enduring quality.",
        content_paragraph_1_enabled: 1,
        content_paragraph_2: "Each piece reflects our commitment to timeless style and conscious craftsmanship — where luxury meets authenticity, and every detail tells a story of dedication and artistry.",
        content_paragraph_2_enabled: 1,
      };

      const fields = Object.keys(defaultData).join(", ");
      const placeholders = Object.keys(defaultData).map(() => "?").join(", ");
      const values = Object.values(defaultData);

      const [insertResult] = await connection.query(`
        INSERT INTO about_the_people (${fields})
        VALUES (${placeholders})
      `, values);

      defaultData.the_people_id = insertResult.insertId;
      return defaultData;
    }
    return rows[0];
  } finally {
    connection.release();
  }
};

const updateThePeople = async (data) => {
  const connection = await ConnectDB.getConnection();
  try {
    const fields = [
      "is_enabled", "section_image", 
      "title_line_1", "title_line_1_enabled", 
      "title_line_2", "title_line_2_enabled",
      "content_paragraph_1", "content_paragraph_1_enabled", 
      "content_paragraph_2", "content_paragraph_2_enabled"
    ];

    const updates = [];
    const queryParams = [];

    const existing = await getThePeople(false);
    const idToUpdate = existing.the_people_id;

    fields.forEach(field => {
      if (data[field] !== undefined) {
        updates.push(`${field} = ?`);
        let val = data[field];
        if (typeof val === 'string' && val === 'true') val = 1;
        if (typeof val === 'string' && val === 'false') val = 0;
        queryParams.push(val);
      }
    });

    if (updates.length > 0) {
      queryParams.push(idToUpdate);
      await connection.query(
        `UPDATE about_the_people SET ${updates.join(", ")} WHERE the_people_id = ?`,
        queryParams
      );
    }

    return await getThePeople(false);
  } finally {
    connection.release();
  }
};

const getExperienceLinen = async (isPublicRoute = false) => {
  const connection = await ConnectDB.getConnection();
  try {
    const query = isPublicRoute
      ? "SELECT * FROM about_experience_linen WHERE section_key = 'experience_the_linen' AND is_enabled = 1"
      : "SELECT * FROM about_experience_linen WHERE section_key = 'experience_the_linen'";
    const [rows] = await connection.query(query);

    if (rows.length === 0) {
      if (isPublicRoute) return null;

      const defaultData = {
        section_key: "experience_the_linen",
        section_name: "Experience The Linen",
        is_enabled: 1,
        image_1: "/images/about-us/img-1.webp",
        image_2: "/images/about-us/img-3.webp",
        image_3: "/images/about-us/img-2.webp",
        image_4: "/images/about-us/img-4.webp",
        title_line_1: "Your Next Favourite Shirt",
        title_line_1_enabled: 1,
        title_line_2: "Begins Here",
        title_line_2_enabled: 1,
        section_description: "Explore a carefully selected range of fabrics that bring together timeless style, everyday wearability, and choices for every occasion.",
        section_description_enabled: 1,
        section_order: 1
      };

      const fields = Object.keys(defaultData).join(", ");
      const placeholders = Object.keys(defaultData).map(() => "?").join(", ");
      const values = Object.values(defaultData);

      const [insertResult] = await connection.query(`
        INSERT INTO about_experience_linen (${fields})
        VALUES (${placeholders})
      `, values);

      defaultData.experience_id = insertResult.insertId;
      return defaultData;
    }
    return rows[0];
  } finally {
    connection.release();
  }
};

const updateExperienceLinen = async (data) => {
  const connection = await ConnectDB.getConnection();
  try {
    const fields = [
      "is_enabled", "image_1", "image_2", "image_3", "image_4",
      "title_line_1", "title_line_1_enabled", 
      "title_line_2", "title_line_2_enabled",
      "section_description", "section_description_enabled"
    ];

    const updates = [];
    const queryParams = [];

    const existing = await getExperienceLinen(false);
    const idToUpdate = existing.experience_id;

    fields.forEach(field => {
      if (data[field] !== undefined) {
        updates.push(`${field} = ?`);
        let val = data[field];
        if (typeof val === 'string' && val === 'true') val = 1;
        if (typeof val === 'string' && val === 'false') val = 0;
        queryParams.push(val);
      }
    });

    if (updates.length > 0) {
      queryParams.push(idToUpdate);
      await connection.query(
        `UPDATE about_experience_linen SET ${updates.join(", ")} WHERE experience_id = ?`,
        queryParams
      );
    }

    return await getExperienceLinen(false);
  } finally {
    connection.release();
  }
};

module.exports = {
  getAboutHero,
  updateAboutHero,
  getWhereItBegan,
  updateWhereItBegan,
  getWhatWeStandFor,
  updateWhatWeStandFor,
  getTheMaking,
  updateTheMaking,
  getThePeople,
  updateThePeople,
  getExperienceLinen,
  updateExperienceLinen
};
