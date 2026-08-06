/**
 * routes/admin.js — Admin Routes for Power Tech API
 *
 * All routes require x-admin-key header matching ADMIN_API_KEY env variable.
 *
 * GET /api/admin/orders              → All orders with user info
 * PUT /api/admin/order/:id/status    → Update order status
 */

'use strict';

const express = require('express');
const router  = express.Router();
const { authenticateAdmin } = require('../middleware/auth');

// Apply admin auth middleware to ALL routes in this router
router.use(authenticateAdmin);

// ─── GET /api/admin/orders ────────────────────────────────────────────────────
/**
 * Returns all orders across all users, with joined user name and phone.
 * Orders sorted by newest first.
 * Requires: x-admin-key header
 * Returns: { orders: [ ...order objects with user info ] }
 */
router.get('/orders', async (req, res) => {
  const db = req.db;

  try {
    // Supabase join: orders + users via user_id foreign key
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
        created_at,
        users (
          name,
          phone,
          email
        )
      `)
      .order('created_at', { ascending: false }); // newest first

    if (error) {
      console.error('[ADMIN GET /orders] Supabase error:', error);
      return res.status(500).json({ error: 'Failed to fetch orders.' });
    }

    return res.status(200).json({ orders: orders || [] });

  } catch (err) {
    console.error('[ADMIN GET /orders] Unexpected error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ─── PUT /api/admin/order/:id/status ─────────────────────────────────────────
/**
 * Updates the order_status of a specific order.
 * Requires: x-admin-key header
 * Params: id — the order UUID
 * Body: { order_status: 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled' }
 * Returns: { message, order: { id, order_status, updated_at? } }
 */
router.put('/order/:id/status', async (req, res) => {
  const db      = req.db;
  const orderId = req.params.id;
  const { order_status } = req.body;

  // ── Validate ──────────────────────────────────────────────────────────────
  if (!orderId) {
    return res.status(400).json({ error: 'Order ID is required.' });
  }

  const validStatuses = ['Processing', 'Shipped', 'Delivered', 'Cancelled'];
  if (!order_status || !validStatuses.includes(order_status)) {
    return res.status(400).json({
      error: `Invalid order status. Must be one of: ${validStatuses.join(', ')}.`,
    });
  }

  // Basic UUID format check
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(orderId)) {
    return res.status(400).json({ error: 'Invalid order ID format.' });
  }

  try {
    // ── Update in Supabase ────────────────────────────────────────────────────
    const { data: updatedOrder, error: updateErr } = await db
      .from('orders')
      .update({ order_status })
      .eq('id', orderId)
      .select('id, order_status, created_at')
      .maybeSingle();

    if (updateErr) {
      console.error('[ADMIN PUT /order/:id/status] Update error:', updateErr);
      return res.status(500).json({ error: 'Failed to update order status.' });
    }

    if (!updatedOrder) {
      return res.status(404).json({ error: `Order not found with ID: ${orderId}` });
    }

    console.log(`[Admin] Order ${orderId.substring(0,8)} status → ${order_status}`);

    return res.status(200).json({
      message: `Order status updated to "${order_status}" successfully.`,
      order:   updatedOrder,
    });

  } catch (err) {
    console.error('[ADMIN PUT /order/:id/status] Unexpected error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

module.exports = router;
