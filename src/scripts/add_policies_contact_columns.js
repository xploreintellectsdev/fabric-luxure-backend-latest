require("dotenv").config();
const ConnectDB = require("../config/db");

async function run() {
  try {
    console.log("Checking and adding columns to policy_pages table...");
    
    const [columns] = await ConnectDB.query("SHOW COLUMNS FROM policy_pages");
    const colNames = columns.map(c => c.Field);

    if (!colNames.includes("contact_email")) {
      await ConnectDB.query("ALTER TABLE policy_pages ADD COLUMN contact_email VARCHAR(255) DEFAULT NULL");
      console.log("✓ Added column 'contact_email'");
    }
    if (!colNames.includes("contact_phone")) {
      await ConnectDB.query("ALTER TABLE policy_pages ADD COLUMN contact_phone VARCHAR(50) DEFAULT NULL");
      console.log("✓ Added column 'contact_phone'");
    }
    if (!colNames.includes("grievance_address")) {
      await ConnectDB.query("ALTER TABLE policy_pages ADD COLUMN grievance_address TEXT DEFAULT NULL");
      console.log("✓ Added column 'grievance_address'");
    }
    if (!colNames.includes("grievance_address_link")) {
      await ConnectDB.query("ALTER TABLE policy_pages ADD COLUMN grievance_address_link TEXT DEFAULT NULL");
      console.log("✓ Added column 'grievance_address_link'");
    }

    console.log("Setting default contact details for each policy page...");
    
    // Set default initial values for all 4 pages
    await ConnectDB.query(
      `UPDATE policy_pages 
       SET contact_email = 'support@fabricluxure.com', 
           contact_phone = '+91 73050 15970' 
       WHERE contact_email IS NULL OR contact_phone IS NULL`
    );

    // Set grievance details specifically for privacy policy
    await ConnectDB.query(
      `UPDATE policy_pages 
       SET grievance_address = '36/11, CHB Colony Street No-04, Velur road, Tiruchengode 637211, Namakkal Dt. Tamil Nadu.', 
           grievance_address_link = 'https://maps.app.goo.gl/TDbC7gTuZhS57MxS6' 
       WHERE page_key = 'privacy-policy'`
    );

    console.log("✓ Database contact details migration complete!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration Error:", error);
    process.exit(1);
  }
}

run();
