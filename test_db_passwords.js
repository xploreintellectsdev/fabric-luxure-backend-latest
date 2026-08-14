const mysql = require('mysql2/promise');

const passwords = ["Xplore@123", "", "root", "admin", "123456", "1234", "password"];

async function findPassword() {
  for (const pw of passwords) {
    try {
      const conn = await mysql.createConnection({
        host: 'localhost',
        port: 3306,
        user: 'root',
        password: pw
      });
      console.log(`SUCCESS connection with password: "${pw}"`);
      
      const [rows] = await conn.execute("SHOW DATABASES;");
      console.log("Databases:", rows.map(r => r.Database));
      
      await conn.end();
      return;
    } catch (e) {
      console.log(`Failed with password "${pw}":`, e.message);
    }
  }
}

findPassword();
