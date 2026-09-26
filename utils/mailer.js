'use strict';

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT, 10) || 587,
  secure: parseInt(process.env.SMTP_PORT, 10) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

function buildMaskedSender(maskName, aliasTag = '', customEmail = '') {
  const baseEmail = customEmail || process.env.SMTP_USER || 'security@sme-phishsim.local';
  const cleanMask = (maskName || 'SME_Phishing_Simulator Security').replace(/"/g, '');

  if (aliasTag && baseEmail.includes('@')) {
    const [localPart, domainPart] = baseEmail.split('@');
    const cleanTag = aliasTag.replace(/[^a-zA-Z0-9.-]/g, '').toLowerCase();
    return `"${cleanMask}" <${localPart}+${cleanTag}@${domainPart}>`;
  }

  return `"${cleanMask}" <${baseEmail}>`;
}

/**
 * Dispatches a Password Reset email with a masked Security Identity.
 */
async function sendPasswordResetEmail(to, rawToken) {
  const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/?reset_token=${rawToken}`;
  const fromHeader = buildMaskedSender('SME_Phishing_Simulator Identity Guard', 'account-recovery');

  const mailOptions = {
    from: fromHeader,
    replyTo: buildMaskedSender('No-Reply Security Operations', 'no-reply'),
    to,
    subject: 'Action Required: Password Reset Request — SME_Phishing_Simulator',
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 28px; background-color: #0f172a; color: #f8fafc; border: 1px solid #1e293b; border-radius: 12px;">
        <div style="margin-bottom: 16px;">
          <span style="background-color: #1d4ed8; color: #ffffff; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: bold;">
            SME_PHISHING_SIMULATOR
          </span>
        </div>
        <h2 style="color: #ffffff; font-size: 20px; margin-bottom: 10px;">Password Recovery Request</h2>
        <p style="color: #cbd5e1; font-size: 15px; line-height: 1.6;">
          We received a request to reset the password associated with <strong>${to}</strong> on the <strong>SME_Phishing_Simulator</strong> platform.
        </p>
        <div style="margin: 28px 0;">
          <a href="${resetUrl}" style="background-color: #2563eb; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block;">
            Reset Account Password
          </a>
        </div>
        <p style="color: #94a3b8; font-size: 13px;">This cryptographic link expires in <strong>1 hour</strong>.</p>
      </div>
    `,
  };

  return await transporter.sendMail(mailOptions);
}

/**
 * Dispatches a simulated Phishing Email with dynamic Sender Mask & Alias.
 */
async function sendPhishingSimulationEmail({
  to,
  subject,
  htmlBody,
  senderMask = 'IT Helpdesk Support',
  senderAlias = 'it-helpdesk',
  replyToAddress = ''
}) {
  const fromHeader = buildMaskedSender(senderMask, senderAlias);
  const replyToHeader = replyToAddress || buildMaskedSender(senderMask, senderAlias);

  return await transporter.sendMail({
    from: fromHeader,
    replyTo: replyToHeader,
    to,
    subject,
    html: htmlBody
  });
}

/**
 * NEW: Dispatches a Mandatory Security Training & Quiz Assignment Email to an Employee!
 */
async function sendTrainingAssignmentEmail({
  to,
  employeeName,
  quizTitle,
  moduleTitle,
  passScore = 70,
  questionCount = 7,
  riskLevel = 'High'
}) {
  const portalUrl = process.env.CLIENT_URL || 'http://localhost:3000';
  const fromHeader = buildMaskedSender('SME_Phishing_Simulator Training Academy', 'training-compliance');

  const mailOptions = {
    from: fromHeader,
    to,
    subject: `Mandatory Training Assigned: ${quizTitle} — SME_Phishing_Simulator`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 28px; background-color: #0f172a; color: #f8fafc; border: 1px solid #1e293b; border-radius: 12px;">
        <div style="margin-bottom: 16px;">
          <span style="background-color: #059669; color: #ffffff; padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: bold;">
            SECURITY AWARENESS ASSIGNMENT
          </span>
        </div>
        <h2 style="color: #ffffff; font-size: 20px; margin-bottom: 10px;">Hello ${employeeName},</h2>
        <p style="color: #cbd5e1; font-size: 15px; line-height: 1.6;">
          The Security Operations Center (SOC) has assigned you a mandatory security awareness module and MCQ assessment on <strong>SME_Phishing_Simulator</strong>.
        </p>
        <div style="background-color: #1e293b; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 4px 0; color: #f8fafc; font-size: 14px;"><strong>Training Module:</strong> ${moduleTitle}</p>
          <p style="margin: 4px 0; color: #f8fafc; font-size: 14px;"><strong>Assigned Quiz:</strong> ${quizTitle} (${questionCount} MCQs)</p>
          <p style="margin: 4px 0; color: #38bdf8; font-size: 14px;"><strong>Passing Score Required:</strong> ${passScore}%</p>
          <p style="margin: 4px 0; color: #fca5a5; font-size: 14px;"><strong>Current Profile Risk Level:</strong> ${riskLevel}</p>
        </div>
        <p style="color: #94a3b8; font-size: 14px;">
          Sign in with your corporate email (<strong>${to}</strong>) and password (<code>Employee123!</code>) to complete the quiz and recalibrate your security risk score to Low:
        </p>
        <div style="margin: 26px 0;">
          <a href="${portalUrl}" style="background-color: #2563eb; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block;">
            Launch Employee Training Portal →
          </a>
        </div>
      </div>
    `
  };

  return await transporter.sendMail(mailOptions);
}

module.exports = {
  transporter,
  buildMaskedSender,
  sendPasswordResetEmail,
  sendPhishingSimulationEmail,
  sendTrainingAssignmentEmail
};