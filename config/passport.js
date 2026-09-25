/* eslint-env node */
'use strict';

require('dotenv').config();
const passport = require('passport');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const pool = require('./db');

// --- 1. Passport JWT Strategy ---
const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET || 'super_secret_key',
};

passport.use(
  new JwtStrategy(jwtOptions, async (jwtPayload, done) => {
    try {
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

// Helper function to resolve or upsert OAuth users
async function handleOAuthUser(provider, profileId, name, email) {
  // 1. Check if user already exists by provider + oauth_id
  const [byOAuth] = await pool.execute(
    'SELECT id, name, email, role FROM Users WHERE oauth_provider = ? AND oauth_id = ?',
    [provider, profileId]
  );
  if (byOAuth.length > 0) return byOAuth[0];

  // 2. Fall back to matching by verified email to link account
  if (email) {
    const [byEmail] = await pool.execute(
      'SELECT id, name, email, role FROM Users WHERE email = ?',
      [email]
    );
    if (byEmail.length > 0) {
      await pool.execute(
        'UPDATE Users SET oauth_provider = ?, oauth_id = ? WHERE id = ?',
        [provider, profileId, byEmail[0].id]
      );
      return byEmail[0];
    }
  }

  // 3. Create fresh admin account
  const fallbackEmail = email || `${provider}_${profileId}@oauth.local`;
  const [insertResult] = await pool.execute(
    'INSERT INTO Users (name, email, role, oauth_provider, oauth_id) VALUES (?, ?, ?, ?, ?)',
    [name || 'OAuth User', fallbackEmail, 'Admin', provider, profileId]
  );

  return {
    id: insertResult.insertId,
    name: name || 'OAuth User',
    email: fallbackEmail,
    role: 'Admin',
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