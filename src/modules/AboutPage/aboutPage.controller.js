const aboutPageService = require("./aboutPage.service");

const getAboutHero = async (req, res) => {
  try {
    const data = await aboutPageService.getAboutHero(req.isPublicRoute);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Get About Hero Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const updateAboutHero = async (req, res) => {
  try {
    const heroData = req.body;
    if (req.file) {
      heroData.hero_image = `/uploads/about-us/${req.file.filename}`;
    }
    const data = await aboutPageService.updateAboutHero(heroData);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Update About Hero Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const getWhereItBegan = async (req, res) => {
  try {
    const data = await aboutPageService.getWhereItBegan(req.isPublicRoute);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Get Where It Began Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const updateWhereItBegan = async (req, res) => {
  try {
    const dataObj = req.body;
    if (req.file) {
      dataObj.image_path = `/uploads/about-us/${req.file.filename}`;
    }
    const data = await aboutPageService.updateWhereItBegan(dataObj);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Update Where It Began Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const getWhatWeStandFor = async (req, res) => {
  try {
    const data = await aboutPageService.getWhatWeStandFor(req.isPublicRoute);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Get What We Stand For Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const updateWhatWeStandFor = async (req, res) => {
  try {
    const dataObj = req.body;
    const data = await aboutPageService.updateWhatWeStandFor(dataObj);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Update What We Stand For Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const getTheMaking = async (req, res) => {
  try {
    const data = await aboutPageService.getTheMaking(req.isPublicRoute);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Get The Making Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const updateTheMaking = async (req, res) => {
  try {
    const dataObj = { ...req.body };
    if (req.file) {
      dataObj.section_image = `/uploads/about-us/${req.file.filename}`;
    }
    const data = await aboutPageService.updateTheMaking(dataObj);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Update The Making Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const getThePeople = async (req, res) => {
  try {
    const isPublicRoute = req.originalUrl.includes("/api/public/");
    const data = await aboutPageService.getThePeople(isPublicRoute);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Get The People Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const updateThePeople = async (req, res) => {
  try {
    const dataObj = { ...req.body };
    if (req.file) {
      dataObj.section_image = `/uploads/about-us/${req.file.filename}`;
    }
    const data = await aboutPageService.updateThePeople(dataObj);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Update The People Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const getExperienceLinen = async (req, res) => {
  try {
    const isPublicRoute = req.originalUrl.includes("/api/public/");
    const data = await aboutPageService.getExperienceLinen(isPublicRoute);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Get Experience Linen Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const updateExperienceLinen = async (req, res) => {
  try {
    const dataObj = { ...req.body };
    
    // req.files will be an object if upload.fields() is used
    if (req.files) {
      if (req.files.image_1) dataObj.image_1 = `/uploads/about-us/${req.files.image_1[0].filename}`;
      if (req.files.image_2) dataObj.image_2 = `/uploads/about-us/${req.files.image_2[0].filename}`;
      if (req.files.image_3) dataObj.image_3 = `/uploads/about-us/${req.files.image_3[0].filename}`;
      if (req.files.image_4) dataObj.image_4 = `/uploads/about-us/${req.files.image_4[0].filename}`;
    }
    
    const data = await aboutPageService.updateExperienceLinen(dataObj);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Update Experience Linen Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
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
