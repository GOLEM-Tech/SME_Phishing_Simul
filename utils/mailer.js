'use strict';

const nodemailer = require('nodemailer');

const port = parseInt(process.env.SMTP_PORT, 10) || 587;
const host = process.env.SMTP_HOST || 'smtp.gmail.com';

const transporter = nodemailer.createTransport({
  host,
  port,
  secure: port === 465, // true for port 465, false for port 587/2525
  auth: {
    user: process.env.SMTP_USER,
    pass: (process.env.SMTP_PASS || '').replace(/\s+/g, ''), // strip any internal spaces
  },
  tls: {
    rejectUnauthorized: false, // Prevents self-signed cert blocks in development
  },
});

/**
 * Builds a formatted sender string supporting masks and Gmail +aliases.
 * Example: "IT Helpdesk Support" <user+it-alert@gmail.com>
 */
function buildMaskedSender(maskName, aliasTag = '') {
  const baseEmail = process.env.SMTP_USER || 'security@phishsim.local';
  const cleanMask = (maskName || process.env.EMAIL_FROM || 'SME_Phishing_Simulator').replace(/"/g, '');

  if (aliasTag && baseEmail.includes('@')) {
    const [localPart, domainPart] = baseEmail.split('@');
    const cleanTag = aliasTag.replace(/[^a-zA-Z0-9.-]/g, '').toLowerCase();
    return `"${cleanMask}" <${localPart}+${cleanTag}@${domainPart}>`;
  }

  return `"${cleanMask}" <${baseEmail}>`;
}

/**
 * Primary dispatch function used across controllers and services.
 * Accepts { to, subject, html, fromName, fromAlias }
 */
async function sendEmail({ to, subject, html, fromName, fromAlias, replyTo }) {
  if (!to) {
    throw new Error('Mailer error: No recipient email specified.');
  }

  const fromHeader = buildMaskedSender(fromName, fromAlias);

  const mailOptions = {
    from: fromHeader,
    to,
    subject: subject || 'Security Awareness Drill',
    html: html || '<p>Security notification</p>',
    replyTo: replyTo || fromHeader,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[Mailer] Message delivered to ${to} (ID: ${info.messageId})`);
    return info;
  } catch (err) {
    console.error(`[Mailer Error] Failed delivering to ${to}:`, err.message);
    throw err;
  }
}

// Aliases for compatibility across existing services
sendEmail.transporter = transporter;
sendEmail.buildMaskedSender = buildMaskedSender;
sendEmail.sendEmail = sendEmail;
sendEmail.sendPhishingSimulationEmail = sendEmail;
sendEmail.sendPasswordResetEmail = async (to, resetToken) => {
  const resetUrl = `${process.env.BASE_URL || process.env.CLIENT_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
  return sendEmail({
    to,
    subject: 'Password Reset Request — SME Phishing Simulator',
    html: `
      <div style="font-family:Arial,sans-serif;padding:24px;border:1px solid #e2e8f0;border-radius:8px;max-width:540px;">
        <h2>Password Recovery Request</h2>
        <p>Click below to reset your password:</p>
        <p><a href="${resetUrl}" style="background:#2563eb;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;font-weight:bold;">Reset Password</a></p>
        <p style="font-size:12px;color:#64748b;">Or link: ${resetUrl}</p>
      </div>
    `,
    fromName: 'Security Identity Guard',
    fromAlias: 'account-recovery',
  });
};

module.exports = sendEmail;