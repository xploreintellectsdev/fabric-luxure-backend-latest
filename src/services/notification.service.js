const ConnectDB = require("../config/db");

const NotificationService = {
  /**
   * Create a new notification for a user
   * @param {Object} data 
   * @param {number} data.userId
   * @param {string} data.title
   * @param {string} data.description
   * @param {string} [data.actionUrl]
   * @param {string} [data.icon]
   */
  createNotification: async ({ userId, title, description, actionUrl = null, icon = null, connection = null }) => {
    const conn = connection || await ConnectDB.getConnection();
    const shouldManageConnection = !connection;
    try {
      const query = `
        INSERT INTO user_notifications (user_id, title, description, action_url, icon, is_read, created_at)
        VALUES (?, ?, ?, ?, ?, FALSE, NOW())
      `;
      await conn.query(query, [userId, title, description, actionUrl, icon]);
    } catch (error) {
      console.error("❌ Error creating notification:", error);
    } finally {
      if (shouldManageConnection) {
        conn.release();
      }
    }
  }
};

module.exports = NotificationService;
