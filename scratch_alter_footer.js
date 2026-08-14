require('dotenv').config({ path: './.env' });
const db = require('./src/config/db');

async function check() {
  try {
    await db.query('ALTER TABLE footer_settings ADD COLUMN is_enabled TINYINT(1) NOT NULL DEFAULT 1;');
    console.log("Added is_enabled column");
    process.exit(0);
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME') {
      console.log("Column is_enabled already exists");
      process.exit(0);
    }
    console.error(err);
    process.exit(1);
  }
}
check();
