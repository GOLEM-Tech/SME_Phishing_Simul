'use strict';

require('dotenv').config();
const passport = require('passport');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const pool = require('./db');

// Automatically ensure `approval_status` column exists on Employees table
(async function ensureApprovalColumn() {
  try {
    await pool.execute(
      "ALTER TABLE Employees ADD COLUMN approval_status VARCHAR(20) NOT NULL DEFAULT 'Approved'"
    );
    console.log('[DB Migration] Added approval_status column to Employees table.');
  } catch (err) {
    // Ignore ER_DUP_FIELDNAME (1060) if column already exists
    if (err.errno !== 1060) {
      console.warn('[DB Migration Notice]:', err.message);
    }
  }
})();

// --- 1. Passport JWT Strategy (Supports both Admin Users and Employees) ---
const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET || 'super_secret_key',
};

passport.use(
  new JwtStrategy(jwtOptions, async (jwtPayload, done) => {
    try {
      if (jwtPayload.role === 'Employee') {
        const [empRows] = await pool.execute(
          'SELECT id, name, email, department, risk_level, approval_status FROM Employees WHERE id = ?',
          [jwtPayload.employeeId || jwtPayload.id]
        );
        if (empRows.length > 0) {
          return done(null, { ...empRows[0], role: 'Employee', employeeId: empRows[0].id });
        }
        return done(null, false);
      }

      const [rows] = await pool.execute(
        'SELECT id, name, email, role FROM Users WHERE id = ?',
        [jwtPayload.id]
      );

      if (rows.length > 0) {
        return done(null, rows[0]);
      }
      return done(null, false);
    } catch (error) {
      return done(error, false);
    }
  })
);

/**
 * Resolves OAuth logins:
 * 1. If the user's email exists in `Users`, authenticate them as an Admin.
 * 2. Otherwise, NEVER make them an Admin. Upsert them into `Employees` with
 *    `approval_status = 'Pending'` so they can choose their department and await Admin approval.
 */
async function handleOAuthUser(provider, profileId, name, email) {
  const normalizedEmail = email ? String(email).trim().toLowerCase() : `${provider}_${profileId}@oauth.local`;
  const displayName = name ? String(name).trim() : 'OAuth Employee';

  // 1. Check if this person is an authorized Admin in `Users`
  const [adminByOAuth] = await pool.execute(
    'SELECT id, name, email, role FROM Users WHERE oauth_provider = ? AND oauth_id = ? LIMIT 1',
    [provider, profileId]
  );
  if (adminByOAuth.length > 0) {
    return { ...adminByOAuth[0], role: 'Admin' };
  }

  const [adminByEmail] = await pool.execute(
    'SELECT id, name, email, role FROM Users WHERE LOWER(email) = ? LIMIT 1',
    [normalizedEmail]
  );
  if (adminByEmail.length > 0) {
    await pool.execute(
      'UPDATE Users SET oauth_provider = ?, oauth_id = ? WHERE id = ?',
      [provider, profileId, adminByEmail[0].id]
    );
    return { ...adminByEmail[0], role: 'Admin' };
  }

  // 2. Not an Admin -> Check if they already exist in `Employees`
  const [empRows] = await pool.execute(
    'SELECT id, name, email, department, risk_level, approval_status FROM Employees WHERE LOWER(email) = ? LIMIT 1',
    [normalizedEmail]
  );

  if (empRows.length > 0) {
    const emp = empRows[0];
    return {
      id: emp.id,
      employeeId: emp.id,
      name: emp.name,
      email: emp.email,
      department: emp.department,
      risk_level: emp.risk_level,
      approval_status: emp.approval_status || 'Approved',
      needsDepartment: emp.department === 'Unassigned',
      role: 'Employee'
    };
  }

  // 3. Brand new OAuth user -> Insert into `Employees` as Pending & Unassigned department
  const [insertEmp] = await pool.execute(
    `INSERT INTO Employees (name, email, department, risk_level, approval_status)
     VALUES (?, ?, 'Unassigned', 'Low', 'Pending')`,
    [displayName, normalizedEmail]
  );

  return {
    id: insertEmp.insertId,
    employeeId: insertEmp.insertId,
    name: displayName,
    email: normalizedEmail,
    department: 'Unassigned',
    risk_level: 'Low',
    approval_status: 'Pending',
    needsDepartment: true,
    role: 'Employee'
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