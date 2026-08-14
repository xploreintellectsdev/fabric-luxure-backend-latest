require("dotenv").config();
const ConnectDB = require("./src/config/db");

async function check() {
  const [columns] = await ConnectDB.query("SHOW COLUMNS FROM corporate_order_enquiries");
  console.log(columns.map(c => c.Field));
  process.exit(0);
}
check();
