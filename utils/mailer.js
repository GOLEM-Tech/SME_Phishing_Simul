const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.ethereal.email',
  port: parseInt(process.env.SMTP_PORT, 10) || 587,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Send password reset email with unhashed token link
 * @param {string} to - Recipient email
 * @param {string} rawToken - Unhashed 32-byte hex token
 */
async function sendPasswordResetEmail(to, rawToken) {
  const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/reset-password?token=${rawToken}`;

  const mailOptions = {
    from: process.env.EMAIL_FROM || '"Phishing Sim Security" <no-reply@phishsim.local>',
    to,
    subject: 'Password Reset Request - Phishing Simulation Platform',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #0f172a; margin-bottom: 8px;">Password Reset Request</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.5;">
          An administrator password reset was requested for your account on the <strong>Phishing Simulation Platform</strong>.
        </p>
        <div style="margin: 28px 0;">
          <a href="${resetUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p style="color: #64748b; font-size: 13px;">
          This link will expire in <strong>1 hour</strong>. If you did not initiate this request, you can safely disregard this email.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="color: #94a3b8; font-size: 12px; word-break: break-all;">
          Or open this link directly: <br/>${resetUrl}
        </p>
      </div>
    `,
  };

  const info = await transporter.sendMail(mailOptions);
  
  // Log preview URL directly to the console for testing
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log('\n================ ETHEREAL EMAIL DISPATCHED ================');
    console.log('Preview URL:', previewUrl);
    console.log('===========================================================\n');
  }

  return info;
}

module.exports = {
  transporter,
  sendPasswordResetEmail,
};
