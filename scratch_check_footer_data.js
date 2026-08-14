require('dotenv').config({ path: './.env' });
const db = require('./src/config/db');

async function check() {
  try {
    const [rows] = await db.query('SELECT * FROM footer_settings LIMIT 1');
    console.log(rows);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
check();
