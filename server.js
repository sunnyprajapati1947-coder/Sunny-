'use strict';

require('dotenv').config();

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const nodemailer = require('nodemailer');
const validator = require('validator');

const app = express();
const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const USERS_FILE = path.join(__dirname, 'users.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);

app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);
app.use(express.json({ limit: '10kb' }));
app.use(express.static(PUBLIC_DIR, { extensions: ['html'], maxAge: '1h' }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { ok: false, message: 'Too many attempts. Please wait 15 minutes and try again.' }
});

function cleanText(value, maxLength) {
  return validator.escape(String(value || '').trim().slice(0, maxLength));
}

function normalizeIp(rawIp) {
  const ip = String(rawIp || '').split(',')[0].trim();
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function validatePayload(body) {
  const username = cleanText(body.username, 24);
  const email = validator.normalizeEmail(String(body.email || '').trim(), {
    gmail_remove_dots: false,
    gmail_remove_subaddress: false
  }) || '';
  const password = String(body.password || '');
  const otp = String(body.otp || '').trim();
  const errors = [];

  if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) {
    errors.push('Username must be 3–24 characters and use only letters, numbers, or underscores.');
  }
  if (!validator.isEmail(email) || email.length > 254) errors.push('Enter a valid email address.');
  if (password.length < 10 || password.length > 128) {
    errors.push('Password must be between 10 and 128 characters.');
  } else if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    errors.push('Password must include an uppercase letter, a lowercase letter, and a number.');
  }
  if (otp && !/^\d{6}$/.test(otp)) errors.push('OTP must be exactly 6 digits.');

  return { errors, username, email, password, otpProvided: Boolean(otp) };
}

// Serialize updates and replace the file atomically. This avoids partial JSON if two
// requests arrive together or the process stops during a write.
let writeQueue = Promise.resolve();
function saveUserSafely(user) {
  const operation = writeQueue.then(async () => {
    let users = [];
    try {
      const contents = await fs.readFile(USERS_FILE, 'utf8');
      users = JSON.parse(contents);
      if (!Array.isArray(users)) throw new Error('users.json must contain a JSON array');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    users.push(user);
    const temporaryFile = `${USERS_FILE}.tmp`;
    await fs.writeFile(temporaryFile, `${JSON.stringify(users, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'w'
    });
    await fs.rename(temporaryFile, USERS_FILE);
  });

  // Keep the queue usable after an individual failed write.
  writeQueue = operation.catch(() => undefined);
  return operation;
}

function mailTransport() {
  const { SMTP_USER, SMTP_APP_PASSWORD } = process.env;
  if (!SMTP_USER || !SMTP_APP_PASSWORD) return null;

  // For Gmail: enable 2-Step Verification, create an App Password, and put
  // that 16-character value in SMTP_APP_PASSWORD. Never commit a real password.
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: SMTP_USER, pass: SMTP_APP_PASSWORD }
  });
}

async function sendAdminAlert(user) {
  const transporter = mailTransport();
  const { ADMIN_EMAIL, SMTP_USER } = process.env;
  if (!transporter || !ADMIN_EMAIL) {
    console.warn('Email alert skipped: configure SMTP_USER, SMTP_APP_PASSWORD, and ADMIN_EMAIL.');
    return false;
  }

  const safe = Object.fromEntries(
    Object.entries(user).map(([key, value]) => [key, validator.escape(String(value))])
  );

  await transporter.sendMail({
    from: `Booyah Security <${SMTP_USER}>`,
    to: ADMIN_EMAIL,
    subject: `New secure sign-in: ${user.username}`,
    text: `A sign-in was recorded.\nUsername: ${user.username}\nEmail: ${user.email}\nIP: ${user.ip}\nTime: ${user.createdAt}\nOTP supplied: ${user.otpProvided ? 'Yes' : 'No'}\n\nPasswords and OTP values are never included in alerts.`,
    html: `
      <div style="font-family:Arial,sans-serif;background:#121212;color:#fff;padding:28px;border-radius:12px">
        <p style="color:#ff6b00;font-size:12px;letter-spacing:2px;text-transform:uppercase">Security alert</p>
        <h1 style="font-size:24px;margin:8px 0 20px">New sign-in recorded</h1>
        <table role="presentation" style="width:100%;border-collapse:collapse;color:#fff">
          <tr><td style="padding:8px;color:#aaa">Username</td><td style="padding:8px">${safe.username}</td></tr>
          <tr><td style="padding:8px;color:#aaa">Email</td><td style="padding:8px">${safe.email}</td></tr>
          <tr><td style="padding:8px;color:#aaa">IP address</td><td style="padding:8px">${safe.ip}</td></tr>
          <tr><td style="padding:8px;color:#aaa">Time</td><td style="padding:8px">${safe.createdAt}</td></tr>
          <tr><td style="padding:8px;color:#aaa">OTP supplied</td><td style="padding:8px">${safe.otpProvided}</td></tr>
        </table>
        <p style="margin-top:22px;color:#aaa;font-size:12px">Passwords and OTP values are intentionally never stored in plaintext or sent by email.</p>
      </div>`
  });
  return true;
}

app.post('/api/auth', authLimiter, async (req, res) => {
  const { errors, username, email, password, otpProvided } = validatePayload(req.body || {});
  if (errors.length) return res.status(400).json({ ok: false, message: errors[0], errors });

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = {
      id: crypto.randomUUID(),
      username,
      email,
      passwordHash,
      otpProvided,
      ip: normalizeIp(req.ip || req.socket.remoteAddress),
      createdAt: new Date().toISOString()
    };

    await saveUserSafely(user);

    // The account record is already saved, so a transient mail outage should not
    // turn a successful request into a duplicate registration attempt.
    sendAdminAlert(user).catch((error) => console.error('Admin email failed:', error.message));

    return res.status(201).json({
      ok: true,
      username,
      message: `Welcome to the squad, ${username}! Your secure profile is ready.`
    });
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(503).json({
      ok: false,
      message: 'We could not save your profile right now. Please try again shortly.'
    });
  }
});

app.use('/api', (_req, res) => res.status(404).json({ ok: false, message: 'API route not found.' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Booyah portal running at http://localhost:${PORT}`);
});
