const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
const ConnectDB = require("../config/db");

async function migrateWallets() {
  try {
    console.log("Starting wallet migration...");

    // Find all users who do not have a wallet
    const [missingUsers] = await ConnectDB.query(
      `SELECT user_id FROM users WHERE user_id NOT IN (SELECT user_id FROM wallets)`
    );

    if (missingUsers.length === 0) {
      console.log("All users already have wallets. No migration needed.");
      process.exit(0);
    }

    console.log(`Found ${missingUsers.length} users missing wallets. Creating wallets now...`);

    for (const user of missingUsers) {
      await ConnectDB.query(
        `INSERT INTO wallets (user_id, balance, status, created_at, updated_at) 
         VALUES (?, 0.00, 'ACTIVE', NOW(), NOW())`,
        [user.user_id]
      );
      console.log(`Created wallet for user_id: ${user.user_id}`);
    }

    console.log("Migration completed successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

migrateWallets();
