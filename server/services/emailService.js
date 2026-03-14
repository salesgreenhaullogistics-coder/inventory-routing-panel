const nodemailer = require('nodemailer');
const { getDb } = require('../db/database');
const { WAREHOUSE_EMAILS } = require('../utils/constants');

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

async function sendSplitOrderAlert(orderId, allocations, sku) {
  const db = getDb();

  for (const alloc of allocations) {
    const recipient = WAREHOUSE_EMAILS[alloc.warehouseId] || process.env.SMTP_USER;
    const subject = `Split Order Alert - Order #${orderId}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color: #1a56db;">Split Order Notification</h2>
        <p>An order has been split across multiple warehouses. Your allocation details:</p>
        <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
          <tr style="background: #f3f4f6;">
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Order ID</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${orderId}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">SKU</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${sku}</td>
          </tr>
          <tr style="background: #f3f4f6;">
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Quantity Allocated</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${alloc.allocatedQty}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Assigned Warehouse</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${alloc.warehouseName}</td>
          </tr>
          <tr style="background: #f3f4f6;">
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Priority Rank</td>
            <td style="padding: 8px; border: 1px solid #ddd;">#${alloc.rank}</td>
          </tr>
        </table>
        <p style="color: #666; font-size: 12px;">This is an automated notification from the Inventory Routing System.</p>
      </div>
    `;

    try {
      await getTransporter().sendMail({
        from: process.env.SMTP_USER,
        to: recipient,
        subject,
        html,
      });

      db.prepare(
        'INSERT INTO email_log (order_id, recipient, subject, status) VALUES (?, ?, ?, ?)'
      ).run(orderId, recipient, subject, 'sent');

      console.log(`Email sent to ${recipient} for order ${orderId}`);
    } catch (err) {
      console.error(`Failed to send email to ${recipient}:`, err.message);
      db.prepare(
        'INSERT INTO email_log (order_id, recipient, subject, status) VALUES (?, ?, ?, ?)'
      ).run(orderId, recipient, subject, 'failed');
    }
  }
}

module.exports = { sendSplitOrderAlert };
