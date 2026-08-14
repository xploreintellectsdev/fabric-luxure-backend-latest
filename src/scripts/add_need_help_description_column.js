require("dotenv").config();
const ConnectDB = require("../config/db");

async function run() {
  try {
    console.log("Checking and adding need_help_description column to policy_pages table...");
    
    const [columns] = await ConnectDB.query("SHOW COLUMNS FROM policy_pages");
    const colNames = columns.map(c => c.Field);

    if (!colNames.includes("need_help_description")) {
      await ConnectDB.query("ALTER TABLE policy_pages ADD COLUMN need_help_description TEXT DEFAULT NULL");
      console.log("✓ Added column 'need_help_description'");
    }

    console.log("Setting default need_help_description values...");
    
    await ConnectDB.query(
      `UPDATE policy_pages 
       SET need_help_description = 'For any queries related to our shipping policies, contact us:' 
       WHERE page_key = 'shipping-policy'`
    );

    await ConnectDB.query(
      `UPDATE policy_pages 
       SET need_help_description = 'For any queries related to our policies, contact us:' 
       WHERE page_key != 'shipping-policy' AND need_help_description IS NULL`
    );

    console.log("✓ Database migration complete!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration Error:", error);
    process.exit(1);
  }
}

run();
