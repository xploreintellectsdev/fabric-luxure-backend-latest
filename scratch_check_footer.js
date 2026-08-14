require('dotenv').config({ path: './.env' });
const db = require('./src/config/db');

async function check() {
  try {
    const [rows] = await db.query('DESCRIBE footer_settings');
    console.log(rows);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
check();
