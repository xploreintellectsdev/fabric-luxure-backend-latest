require("dotenv").config();
const ConnectDB = require("./src/config/db");

async function testConnection() {
  try {
    const [tables] = await ConnectDB.execute("SHOW TABLES;");
    console.log("Database Tables:", tables);

    const [usersColumns] = await ConnectDB.execute("DESCRIBE users;");
    console.log("Users Table Schema:", usersColumns);

    const [loginHistoryColumns] = await ConnectDB.execute("DESCRIBE user_login_history;");
    console.log("User Login History Schema:", loginHistoryColumns);

    process.exit(0);
  } catch (error) {
    console.error("DB Test Error:", error);
    process.exit(1);
  }
}

testConnection();
