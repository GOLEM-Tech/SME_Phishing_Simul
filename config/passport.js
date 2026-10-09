/* eslint-env node */
'use strict';

require('dotenv').config();
const passport = require('passport');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const pool = require('./db');

// Explicit admin allowlist to prevent accidental privilege escalation
const ADMIN_EMAILS = [
  'omjalela4@gmail.com',
  'sharmistabar@gmail.com',
  'maitreyajadhav@gmail.com',
  'abdulhannan@gmail.com'
];

// --- 1. Passport JWT Strategy ---
const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET || 'super_secret_key',
};

passport.use(
  new JwtStrategy(jwtOptions, async (jwtPayload, done) => {
    try {
      const role = jwtPayload.role || 'Admin';

      // 1. If payload explicitly specifies Employee, look in Employees table
      if (role === 'Employee') {
        const [empRows] = await pool.execute(
          'SELECT id, name, email, department, risk_level, approval_status FROM Employees WHERE id = ? LIMIT 1',
          [jwtPayload.id]
        );
        if (empRows.length > 0) {
          return done(null, {
            ...empRows[0],
            role: 'Employee',
            sessionId: jwtPayload.sessionId || null,
          });
        }
      }

      // 2. Query Users table (Admin accounts)
      const [userRows] = await pool.execute(
        'SELECT id, name, email, role FROM Users WHERE id = ? LIMIT 1',
        [jwtPayload.id]
      );
      if (userRows.length > 0) {
        return done(null, {
          ...userRows[0],
          role: userRows[0].role || 'Admin',
          sessionId: jwtPayload.sessionId || null,
        });
      }

      // 3. Fallback to Employees table
      const [fallbackEmp] = await pool.execute(
        'SELECT id, name, email, department, risk_level, approval_status FROM Employees WHERE id = ? LIMIT 1',
        [jwtPayload.id]
      );
      if (fallbackEmp.length > 0) {
        return done(null, {
          ...fallbackEmp[0],
          role: 'Employee',
          sessionId: jwtPayload.sessionId || null,
        });
      }

      return done(null, false);
    } catch (error) {
      console.error('[Passport JWT Strategy Error]:', error.message);
      return done(error, false);
    }
  })
);

// --- Safe OAuth Upsert Engine ---
async function handleOAuthUser(provider, profileId, name, email) {
  const normalizedEmail = (email || '').toLowerCase().trim();
  const isAdmin = ADMIN_EMAILS.includes(normalizedEmail);

  if (isAdmin) {
    // Check or upsert into Users table as Admin
    const [existingAdmin] = await pool.execute(
      'SELECT id, name, email, role FROM Users WHERE email = ? LIMIT 1',
      [normalizedEmail]
    );

    if (existingAdmin.length > 0) {
      await pool.execute(
        'UPDATE Users SET oauth_provider = ?, oauth_id = ? WHERE id = ?',
        [provider, profileId, existingAdmin[0].id]
      );
      return { ...existingAdmin[0], role: 'Admin' };
    }

    const [newAdmin] = await pool.execute(
      'INSERT INTO Users (name, email, role, oauth_provider, oauth_id) VALUES (?, ?, ?, ?, ?)',
      [name || 'Admin', normalizedEmail, 'Admin', provider, profileId]
    );
    return { id: newAdmin.insertId, name: name || 'Admin', email: normalizedEmail, role: 'Admin' };
  }

  // Non-admin email: MUST be treated as an Employee
  const [existingEmp] = await pool.execute(
    'SELECT id, name, email, department, risk_level, approval_status FROM Employees WHERE email = ? LIMIT 1',
    [normalizedEmail]
  );

  if (existingEmp.length > 0) {
    return { ...existingEmp[0], role: 'Employee' };
  }

  // Auto-register new employee under UNDETERMINED risk
  const [newEmp] = await pool.execute(
    'INSERT INTO Employees (name, email, department, risk_level, approval_status) VALUES (?, ?, ?, ?, ?)',
    [name || 'Employee', normalizedEmail, 'General', 'UNDETERMINED', 'Approved']
  );

  return {
    id: newEmp.insertId,
    name: name || 'Employee',
    email: normalizedEmail,
    department: 'General',
    risk_level: 'UNDETERMINED',
    approval_status: 'Approved',
    role: 'Employee',
  };
}

// --- 2. Google OAuth Strategy ---
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback',
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
          const user = await handleOAuthUser('google', profile.id, profile.displayName, email);
          return done(null, user);
        } catch (error) {
          return done(error, false);
        }
      }
    )
  );
}

// --- 3. GitHub OAuth Strategy ---
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/api/auth/github/callback',
        scope: ['user:email'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
          const user = await handleOAuthUser('github', profile.id, profile.displayName || profile.username, email);
          return done(null, user);
        } catch (error) {
          return done(error, false);
        }
      }
    )
  );
}

module.exports = passport;