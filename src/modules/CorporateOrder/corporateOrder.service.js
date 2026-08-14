const repository = require('./corporateOrder.repository');
const emailService = require('../../services/email.service');

// Process new corporate order enquiry
const submitEnquiry = async (data) => {
  // Validate data
  const { name, email, mobile, company_name, message, consent } = data;
  if (!name || !email || !mobile || !company_name || !message || !consent) {
    throw new Error('All fields are required.');
  }

  // Create the record in DB
  const enquiry = await repository.createEnquiry(data);

  // Determine Customer Type
  const customerType = data.user_id ? 'Registered User' : 'Guest User';
  
  // Format the submission date
  const submittedDate = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  // Try sending the email to admin
  try {
    const htmlContent = `
      <h2>New Corporate Order Enquiry</h2>
      <p>A new corporate order enquiry has been submitted. Here are the details:</p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
        <tr><td style="padding: 8px; border: 1px solid #ddd; width: 30%;"><strong>Customer Type:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${customerType}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Name:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${name}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Email:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${email}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Phone Number:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${mobile}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Company Name:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${company_name}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Message:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${message}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Submitted On:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${submittedDate}</td></tr>
      </table>
      <p style="margin-top: 20px;">Please check the Admin Dashboard to respond to this enquiry.</p>
    `;

    await emailService.sendCorporateOrderEmail({
      subject: 'New Corporate Order Enquiry Received',
      html: htmlContent
    });
  } catch (error) {
    console.error("❌ Failed to send Corporate Order Admin Email:", error.message);
    // Continue despite email failure, enquiry is saved
  }

  return enquiry;
};

// Get enquiries for admin dashboard
const getAdminEnquiries = async (page = 1, limit = 10, search = '') => {
  return await repository.getEnquiries(page, limit, search);
};

// Get single enquiry by ID
const getEnquiryDetails = async (id) => {
  const enquiry = await repository.getEnquiryById(id);
  if (!enquiry) {
    throw new Error('Enquiry not found.');
  }
  return enquiry;
};

// Update enquiry status
const updateEnquiryStatus = async (id, status) => {
  const validStatuses = ['NEW', 'CONTACTED', 'QUOTATION_SENT', 'CLOSED'];
  if (!validStatuses.includes(status)) {
    throw new Error('Invalid status.');
  }
  return await repository.updateEnquiryStatus(id, status);
};

module.exports = {
  submitEnquiry,
  getAdminEnquiries,
  getEnquiryDetails,
  updateEnquiryStatus
};
