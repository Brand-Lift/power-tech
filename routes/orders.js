/**
 * routes/orders.js — Order Routes for Power Tech API
 *
 * GET  /api/orders  → (JWT protected) Get all orders for logged-in user
 * POST /api/orders  → (JWT protected) Place a new order
 */

'use strict';

const express  = require('express');
const router   = express.Router();
const { authenticateUser } = require('../middleware/auth');

// ─── GET /api/orders ──────────────────────────────────────────────────────────
/**
 * Returns all orders for the authenticated user, sorted by newest first.
 * Requires: Authorization: Bearer <jwt>
 * Returns: { orders: [ ...order objects ] }
 */
router.get('/orders', authenticateUser, async (req, res) => {
  const db     = req.db;
  const userId = req.user.id;

  try {
    const { data: orders, error } = await db
      .from('orders')
      .select(`
        id,
        customer_name,
        customer_phone,
        customer_address,
        customer_city,
        customer_pincode,
        items,
        total_amount,
        payment_method,
        payment_screenshot,
        order_status,
        created_at
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false }); // newest first

    if (error) {
      console.error('[GET /orders] Supabase error:', error);
      return res.status(500).json({ error: 'Failed to fetch orders.' });
    }

    return res.status(200).json({ orders: orders || [] });

  } catch (err) {
    console.error('[GET /orders] Unexpected error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ─── POST /api/orders ─────────────────────────────────────────────────────────
/**
 * Creates a new order.
 * Requires: Authorization: Bearer <jwt>
 *
 * Body: {
 *   customer_name:    string,
 *   customer_phone:   string (10 digits),
 *   customer_address: string,
 *   customer_city:    string,
 *   customer_pincode: string (6 digits),
 *   items:            Array<{ id, name, model, price, quantity }>,
 *   total_amount:     number,
 *   payment_method:   'COD' | 'UPI',
 *   payment_screenshot: string | null  ← Base64 data URL (UPI only)
 * }
 *
 * Returns: { message: 'Order placed.', order: { id, order_status, created_at, ... } }
 */
router.post('/orders', authenticateUser, async (req, res) => {
  const db     = req.db;
  const userId = req.user.id;

  const {
    customer_name,
    customer_phone,
    customer_address,
    customer_city,
    customer_pincode,
    items,
    total_amount,
    payment_method,
    payment_screenshot,
  } = req.body;

  // ── Validate required fields ──────────────────────────────────────────────
  const errors = [];

  if (!customer_name || customer_name.trim().length < 2) {
    errors.push('Customer name is required (min 2 characters).');
  }
  if (!customer_phone || !/^\d{10}$/.test(customer_phone)) {
    errors.push('Customer phone must be a 10-digit number.');
  }
  if (!customer_address || customer_address.trim().length < 5) {
    errors.push('Customer address is required.');
  }
  if (!customer_city || customer_city.trim().length < 2) {
    errors.push('City is required.');
  }
  if (!customer_pincode || !/^\d{6}$/.test(customer_pincode)) {
    errors.push('Pincode must be a 6-digit number.');
  }
  if (!Array.isArray(items) || items.length === 0) {
    errors.push('Order must contain at least one item.');
  }
  if (!total_amount || isNaN(parseFloat(total_amount)) || parseFloat(total_amount) <= 0) {
    errors.push('Total amount must be a positive number.');
  }
  if (!['COD', 'UPI'].includes(payment_method)) {
    errors.push("Payment method must be 'COD' or 'UPI'.");
  }
  if (payment_method === 'UPI' && !payment_screenshot) {
    errors.push('Payment screenshot is required for UPI orders.');
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: errors.join(' ') });
  }

  // ── Validate items structure ───────────────────────────────────────────────
  for (const item of items) {
    if (!item.name || !item.price || !item.quantity) {
      return res.status(400).json({ error: 'Each item must have name, price, and quantity.' });
    }
    if (item.quantity < 1 || item.quantity > 100) {
      return res.status(400).json({ error: `Invalid quantity for item: ${item.name}` });
    }
  }

  // ── Verify total amount matches items (server-side recalculation) ─────────
  const calculatedTotal = items.reduce(
    (sum, item) => sum + (parseFloat(item.price) * parseInt(item.quantity, 10)),
    0
  );

  // Allow small floating-point tolerance
  if (Math.abs(calculatedTotal - parseFloat(total_amount)) > 1) {
    console.warn(`[POST /orders] Total mismatch. Client: ${total_amount}, Server: ${calculatedTotal}`);
    return res.status(400).json({ error: 'Total amount does not match item prices. Please try again.' });
  }

  // ── Validate Base64 screenshot size (max 10MB) ────────────────────────────
  if (payment_screenshot) {
    const base64DataPart = payment_screenshot.split(',')[1] || payment_screenshot;
    const sizeBytes      = Math.ceil((base64DataPart.length * 3) / 4);
    const sizeMB         = sizeBytes / (1024 * 1024);
    if (sizeMB > 10) {
      return res.status(400).json({ error: 'Payment screenshot is too large (max 10MB).' });
    }
  }

  try {
    // ── Insert order ──────────────────────────────────────────────────────────
    const { data: order, error: insertErr } = await db
      .from('orders')
      .insert({
        user_id:            userId,
        customer_name:      customer_name.trim(),
        customer_phone:     customer_phone.trim(),
        customer_address:   customer_address.trim(),
        customer_city:      customer_city.trim(),
        customer_pincode:   customer_pincode.trim(),
        items:              items,          // stored as jsonb
        total_amount:       calculatedTotal, // use server-calculated total
        payment_method,
        payment_screenshot: payment_screenshot || null,
        order_status:       'Processing',   // default status
      })
      .select('id, order_status, created_at, total_amount')
      .single();

    if (insertErr) {
      console.error('[POST /orders] Insert error:', insertErr);
      return res.status(500).json({ error: 'Failed to place order. Please try again.' });
    }

    return res.status(201).json({
      message: 'Order placed successfully.',
      order,
    });

  } catch (err) {
    console.error('[POST /orders] Unexpected error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

module.exports = router;
