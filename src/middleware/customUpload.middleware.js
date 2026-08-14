const multer = require("multer");
const path = require("path");
const fs = require("fs");
const ConnectDB = require("../config/db");

// We need to fetch the custom_monogram_settings dynamically inside the middleware
// Multer limits are evaluated early, so setting a dynamic limit requires a small workaround 
// or setting a high max limit in multer and validating in the controller.
// We'll set a high max limit (50MB, the max allowed by the settings) in multer,
// and strictly validate the actual size in the controller.

const uploadPath = path.join(__dirname, "..", "..", "uploads", "custom_monograms");

if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + "-" + file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_"));
    },
});

// We accept image/pdf types generally, and strict validation against settings will be done in the controller.
const customMonogramUpload = multer({
    storage,
    limits: {
        fileSize: 55 * 1024 * 1024, // 55MB absolute max (setting allows up to 50MB)
    },
});

module.exports = customMonogramUpload;
