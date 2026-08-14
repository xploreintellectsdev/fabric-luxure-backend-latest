const ConnectDB = require("../../config/db");
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const saveContactMessage = async (contactData) => {
    const { name, phone, email, message } = contactData;
    
    const query = `
        INSERT INTO contact (name, phone_number, email, message, createdAt) 
        VALUES (?, ?, ?, ?, NOW())
    `;
    
    const [result] = await ConnectDB.execute(query, [name, phone, email, message]);
    
    return {
        id: result.insertId,
        ...contactData
    };
};

const processContactMessage = async (contactData) => {
  const savedRecord = await saveContactMessage(contactData);

  const emailHtml = `
        <h2>New Customer Enquiry Received</h2>
        <p><strong>Name:</strong> ${contactData.name}</p>
        <p><strong>Phone:</strong> ${contactData.phone}</p>
        <p><strong>Email:</strong> ${contactData.email}</p>
        <p><strong>Message:</strong></p>
        <blockquote style="background: #f4f4f4; padding: 10px; border-left: 3px solid #A37646;">
            ${contactData.message}
        </blockquote>
        <hr />
        <p style="font-size: 11px; color: gray;">This is an automated system alert from your Linen Journey portal.</p>
    `;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.ADMIN_EMAIL,
    subject: `🚨 New Web Enquiry from ${contactData.name}`,
    html: emailHtml,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error(
        "❌ Failed to dispatch admin notification email:",
        error.message,
      );
    } else {
      console.log(
        "📧 Admin notification email dispatched successfully:",
        info.response,
      );
    }
  });

  return savedRecord;
};

const getAdminContacts = async (page = 1, limit = 10, search = '') => {
  const offset = (page - 1) * limit;
  let query = 'SELECT * FROM contact';
  let countQuery = 'SELECT COUNT(*) as total FROM contact';
  const queryParams = [];
  const countParams = [];

  if (search) {
    const searchString = `%${search}%`;
    const searchClause = ' WHERE name LIKE ? OR email LIKE ? OR phone_number LIKE ?';
    query += searchClause;
    countQuery += searchClause;
    queryParams.push(searchString, searchString, searchString);
    countParams.push(searchString, searchString, searchString);
  }

  query += ` ORDER BY createdAt DESC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;

  const [rows] = await ConnectDB.execute(query, queryParams);
  const [countResult] = await ConnectDB.execute(countQuery, countParams);
  
  return {
    contacts: rows,
    total: countResult[0].total,
    page: parseInt(page),
    limit: parseInt(limit)
  };
};

const updateContactStatus = async (contactId, status) => {
  const query = 'UPDATE contact SET status = ? WHERE contact_id = ?';
  const [result] = await ConnectDB.execute(query, [status, contactId]);
  return result.affectedRows > 0;
};

const deleteContact = async (contactId) => {
  const query = 'DELETE FROM contact WHERE contact_id = ?';
  const [result] = await ConnectDB.execute(query, [contactId]);
  return result.affectedRows > 0;
};

module.exports = {
  processContactMessage,
  getAdminContacts,
  updateContactStatus,
  deleteContact
};
