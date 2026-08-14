const multer = require("multer");
const path = require("path");
const fs = require("fs");

const createUploader = (imagePath) => {
  const uploadPath = path.join(__dirname, "..", `/uploads/${imagePath}`);
  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + "-" + file.originalname);
    },
  });

  const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpg|jpeg|png|webp|mp4|mov|avi|mkv|webm/;

    const isValidExt = allowedTypes.test(
      path.extname(file.originalname).toLowerCase(),
    );

    const isValidMime = allowedTypes.test(file.mimetype);

    if (isValidExt && isValidMime) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, JPEG, PNG, WEBP images and MP4, MOV, AVI, MKV, WEBM videos are allowed."));
    }
  };

  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB
    },
  });
};

module.exports = createUploader;
