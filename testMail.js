// test-email.js
require('dotenv').config();
const sendEmail = require('./utils/mailer');

(async () => {
  console.log('--- Testing SMTP Transporter Connection ---');
  try {
    await sendEmail.transporter.verify();
    console.log('✅ SMTP connection successful!');

    console.log('--- Sending Test Message ---');
    const target = process.env.SMTP_USER; // Sends a test message to yourself
    const res = await sendEmail({
      to: target,
      subject: 'SMTP Diagnostics — SME_Phishing_Simulator',
      html: '<h3>SMTP Engine is functioning properly.</h3>',
      fromName: 'System Test',
      fromAlias: 'test',
    });
    console.log('✅ Test email sent successfully! Message ID:', res.messageId);
  } catch (err) {
    console.error('❌ Email dispatch failed:');
    console.error(err);
  } finally {
    process.exit();
  }
})();
