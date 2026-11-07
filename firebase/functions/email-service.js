// Email Notification Service - NextBuy 77
// Section 34: Provider-agnostic Nodemailer wrapper for transactional customer emails
const nodemailer = require('nodemailer');

// Configure SMTP transport using environment variables or Secret Manager
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
  port: parseInt(process.env.SMTP_PORT, 10) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
});

/**
 * Send transactional email to customer
 * @param {Object} options 
 * @param {string} options.to 
 * @param {string} options.subject 
 * @param {string} options.html 
 * @param {string} [options.text] 
 * @returns {Promise<boolean>}
 */
async function sendTransactionalEmail({ to, subject, html, text }) {
  if (!to) return false;

  // If credentials are not configured yet, log safely without failing
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`[Email Pending SMTP Config] To: ${to} | Subject: ${subject}`);
    return true;
  }

  try {
    await transporter.sendMail({
      from: `"NextBuy 77" <${process.env.SMTP_FROM || 'orders@nextbuy77.com'}>`,
      to,
      subject,
      html,
      text: text || ''
    });
    return true;
  } catch (err) {
    console.error('Failed to send email:', err);
    return false;
  }
}

/**
 * Generate standard Order Confirmation HTML email
 */
function getOrderConfirmationEmailHtml({ orderNumber, customerName, totalRupees, utr }) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #E6D8CA; border-radius: 8px; background: #FFF3E6;">
      <h2 style="color: #381932; margin-bottom: 8px;">NextBuy 77</h2>
      <p style="font-size: 14px; color: #5C525A;">Buy Next. Buy Better.</p>
      <hr style="border: 0; border-top: 1px solid #E6D8CA; margin: 20px 0;">
      <h3 style="color: #381932;">Order Received: ${orderNumber}</h3>
      <p>Dear ${customerName || 'Customer'},</p>
      <p>Thank you for shopping with NextBuy 77. We have received your order reference.</p>
      <div style="background: #FFFFFF; padding: 16px; border-radius: 6px; margin: 16px 0;">
        <p style="margin: 4px 0;"><strong>Order Number:</strong> ${orderNumber}</p>
        <p style="margin: 4px 0;"><strong>Total Payable:</strong> ₹${totalRupees}</p>
        ${utr ? `<p style="margin: 4px 0;"><strong>Submitted UTR:</strong> ${utr}</p>` : ''}
      </div>
      <p style="font-size: 13px; color: #5C525A;">Your stock is reserved. Our administrative team will verify your payment against bank records shortly.</p>
      <p style="font-size: 12px; color: #877B84; margin-top: 24px;">&copy; 2026 NextBuy 77. All rights reserved.</p>
    </div>
  `;
}

module.exports = {
  sendTransactionalEmail,
  getOrderConfirmationEmailHtml
};

