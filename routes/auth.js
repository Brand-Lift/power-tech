/**
 * routes/auth.js — Authentication Routes for Power Tech API
 *
 * POST /api/auth/register  → Create new user account
 * POST /api/auth/login     → Authenticate user, return JWT
 */

'use strict';

const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const router   = express.Router();

// ─── Helper: generate JWT ─────────────────────────────────────────────────────
/**
 * Creates a signed JWT for the given user.
 * @param {{ id: string, name: string, phone: string }} user
 * @returns {string} JWT token
 */
function createToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, phone: user.phone },
    process.env.JWT_SECRET,
    { expiresIn: '30d' } // token valid for 30 days
  );
}

// ─── POST /api/auth/register ─────────────────────────────────────────────────
/**
 * Registers a new user.
 * Body: { name, phone, email?, password }
 * Returns: { token, user: { id, name, phone, email } }
 */
router.post('/register', async (req, res) => {
  const { name, phone, email, password } = req.body;

  // ── Validate required fields ──────────────────────────────────────────────
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ error: 'Name must be at least 2 characters.' });
  }

  if (!phone || !/^\d{10}$/.test(phone)) {
    return res.status(400).json({ error: 'Phone must be a valid 10-digit number.' });
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }

  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const db = req.db;

  try {
    // ── Check phone uniqueness ────────────────────────────────────────────────
    const { data: existing, error: checkErr } = await db
      .from('users')
      .select('id')
      .eq('phone', phone)
      .maybeSingle();

    if (checkErr) {
      console.error('[Register] Phone check error:', checkErr);
      return res.status(500).json({ error: 'Database error. Please try again.' });
    }

    if (existing) {
      return res.status(409).json({
        error: 'This phone number is already registered. Please sign in instead.',
      });
    }

    // ── Hash password (12 salt rounds — strong security) ──────────────────────
    const password_hash = await bcrypt.hash(password, 12);

    // ── Insert new user ───────────────────────────────────────────────────────
    const { data: newUser, error: insertErr } = await db
      .from('users')
      .insert({
        name:          name.trim(),
        phone:         phone.trim(),
        email:         email ? email.trim().toLowerCase() : null,
        password_hash,
      })
      .select('id, name, phone, email')
      .single();

    if (insertErr) {
      console.error('[Register] Insert error:', insertErr);
      // Handle unique constraint violation (race condition)
      if (insertErr.code === '23505') {
        return res.status(409).json({
          error: 'This phone number is already registered.',
        });
      }
      return res.status(500).json({ error: 'Could not create account. Please try again.' });
    }

    // ── Generate token and return ─────────────────────────────────────────────
    const token = createToken(newUser);

    return res.status(201).json({
      token,
      user: {
        id:    newUser.id,
        name:  newUser.name,
        phone: newUser.phone,
        email: newUser.email,
      },
    });

  } catch (err) {
    console.error('[Register] Unexpected error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
/**
 * Authenticates an existing user.
 * Body: { phone, password }
 * Returns: { token, user: { id, name, phone, email } }
 */
router.post('/login', async (req, res) => {
  const { phone, password } = req.body;

  // ── Validate ──────────────────────────────────────────────────────────────
  if (!phone || !/^\d{10}$/.test(phone)) {
    return res.status(400).json({ error: 'Please provide a valid 10-digit phone number.' });
  }

  if (!password) {
    return res.status(400).json({ error: 'Password is required.' });
  }

  const db = req.db;

  try {
    // ── Find user by phone ────────────────────────────────────────────────────
    const { data: user, error: findErr } = await db
      .from('users')
      .select('id, name, phone, email, password_hash')
      .eq('phone', phone)
      .maybeSingle();

    if (findErr) {
      console.error('[Login] Find user error:', findErr);
      return res.status(500).json({ error: 'Database error. Please try again.' });
    }

    // ── Use a vague error message to avoid user enumeration ──────────────────
    if (!user) {
      return res.status(401).json({ error: 'Invalid phone number or password.' });
    }

    // ── Compare password ──────────────────────────────────────────────────────
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid phone number or password.' });
    }

    // ── Generate token ────────────────────────────────────────────────────────
    const token = createToken(user);

    return res.status(200).json({
      token,
      user: {
        id:    user.id,
        name:  user.name,
        phone: user.phone,
        email: user.email,
      },
    });

  } catch (err) {
    console.error('[Login] Unexpected error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

module.exports = router;
