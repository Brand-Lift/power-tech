/**
 * middleware/auth.js — JWT Authentication Middleware
 *
 * Usage: add `authenticateUser` before any route that requires login.
 * Sets req.user = { id, name, phone } on success.
 */

'use strict';

const jwt = require('jsonwebtoken');

/**
 * Middleware that validates the Bearer JWT token from the Authorization header.
 * If valid, attaches decoded payload to req.user and calls next().
 * If invalid or missing, returns 401.
 */
function authenticateUser(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentication required. Please sign in.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, name, phone, iat, exp }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Session expired. Please sign in again.',
      });
    }
    return res.status(401).json({
      error: 'Invalid authentication token.',
    });
  }
}

/**
 * Middleware that validates the x-admin-key header.
 * Checks against ADMIN_API_KEY env variable.
 */
function authenticateAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];

  if (!key) {
    return res.status(401).json({
      error: 'Admin key is required. Provide it in the x-admin-key header.',
    });
  }

  if (key !== process.env.ADMIN_API_KEY) {
    return res.status(403).json({
      error: 'Invalid admin key. Access denied.',
    });
  }

  next();
}

module.exports = { authenticateUser, authenticateAdmin };
