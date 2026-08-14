require("dotenv").config();
const ConnectDB = require("../config/db");

async function run() {
  try {
    console.log("Checking policy_sections table structure...");
    const [columns] = await ConnectDB.query("SHOW COLUMNS FROM policy_sections");
    const colNames = columns.map(c => c.Field);

    if (colNames.includes("section_type")) {
      console.log("Dropping column 'section_type' from policy_sections table...");
      await ConnectDB.query("ALTER TABLE policy_sections DROP COLUMN section_type");
      console.log("✓ Dropped column 'section_type'");
    } else {
      console.log("Column 'section_type' does not exist in policy_sections table.");
    }

    console.log("✓ Database cleanup complete!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Cleanup Error:", error);
    process.exit(1);
  }
}

run();
