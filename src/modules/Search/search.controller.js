const searchService = require("./search.service");

const getSidebarData = async (req, res) => {
  try {
    const data = await searchService.getSidebarData();
    return res.status(200).json({ success: true, data, message: "Sidebar data fetched successfully" });
  } catch (error) {
    console.error("Error fetching sidebar data:", error);
    return res.status(500).json({ success: false, error: error.message, message: "Failed to fetch sidebar data" });
  }
};

const getLiveSuggestions = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(200).json({ success: true, data: [], message: "No query provided" });
    }
    const data = await searchService.getLiveSuggestions(q);
    return res.status(200).json({ success: true, data, message: "Live suggestions fetched successfully" });
  } catch (error) {
    console.error("Error fetching live suggestions:", error);
    return res.status(500).json({ success: false, error: error.message, message: "Failed to fetch live suggestions" });
  }
};

module.exports = {
  getSidebarData,
  getLiveSuggestions
};
