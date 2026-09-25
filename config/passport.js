require('dotenv').config();
const passport = require('passport');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const pool = require('./db');

const options = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET || 'super_secret_key'
};

passport.use(
  new JwtStrategy(options, async (jwtPayload, done) => {
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

module.exports = passport;

module.exports = passport;