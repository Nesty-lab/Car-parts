// routes/admin.js
// Everything under /admin — login plus product, order, message, and
// announcement management.

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const db = require('../db/database');
const upload = require('../middleware/upload');
const { requireAdmin } = require('../middleware/auth');

// ---------- Login ----------
router.get('/login', (req, res) => {
  if (req.session && req.session.adminId) return res.redirect('/admin');
  res.render('admin/login', { page: 'admin-login', error: null });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get((username || '').trim());

  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.render('admin/login', { page: 'admin-login', error: 'Invalid username or password.' });
  }

  req.session.adminId = user.id;
  req.session.adminUsername = user.username;
  res.redirect('/admin');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// Everything below this line requires an authenticated admin.
router.use(requireAdmin);

// ---------- Dashboard ----------
router.get('/', (req, res) => {
  const stats = {
    products: db.prepare('SELECT COUNT(*) AS c FROM products').get().c,
    orders: db.prepare('SELECT COUNT(*) AS c FROM orders').get().c,
    pendingOrders: db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status = 'Pending'").get().c,
    messages: db.prepare('SELECT COUNT(*) AS c FROM messages').get().c,
    unreadMessages: db.prepare('SELECT COUNT(*) AS c FROM messages WHERE is_read = 0').get().c,
  };
  const recentOrders = db
    .prepare(
      `SELECT o.*, p.name AS product_name, b.name AS branch_name
       FROM orders o
       LEFT JOIN products p ON o.product_id = p.id
       LEFT JOIN branches b ON o.branch_id = b.id
       ORDER BY o.created_at DESC LIMIT 5`
    )
    .all();
  res.render('admin/dashboard', { page: 'admin-dashboard', stats, recentOrders });
});

// ---------- Product management ----------
router.get('/products', (req, res) => {
  const products = db
    .prepare(
      `SELECT p.*, b.name AS brand_name, m.name AS model_name
       FROM products p
       LEFT JOIN brands b ON p.brand_id = b.id
       LEFT JOIN models m ON p.model_id = m.id
       ORDER BY p.created_at DESC`
    )
    .all();
  res.render('admin/products', { page: 'admin-products', products });
});

router.get('/products/new', (req, res) => {
  const brands = db.prepare('SELECT * FROM brands ORDER BY name').all();
  const models = db.prepare('SELECT * FROM models ORDER BY name').all();
  res.render('admin/product-form', {
    page: 'admin-products',
    product: null,
    brands,
    models,
    errors: null,
  });
});

router.post('/products/new', upload.single('image'), (req, res) => {
  const { name, category, description, price, stock, brand_id, model_id, featured } = req.body;
  const errors = [];
  if (!name || !name.trim()) errors.push('Product name is required.');
  if (price === undefined || price === '' || isNaN(Number(price))) errors.push('Enter a valid price.');

  if (errors.length) {
    const brands = db.prepare('SELECT * FROM brands ORDER BY name').all();
    const models = db.prepare('SELECT * FROM models ORDER BY name').all();
    return res.render('admin/product-form', { page: 'admin-products', product: req.body, brands, models, errors });
  }

  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

  db.prepare(
    `INSERT INTO products (name, category, description, price, stock, image, brand_id, model_id, featured)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    name.trim(),
    (category || '').trim() || null,
    (description || '').trim() || null,
    Number(price),
    stock ? Number(stock) : 0,
    imagePath,
    brand_id || null,
    model_id || null,
    featured ? 1 : 0
  );

  res.redirect('/admin/products');
});

router.get('/products/:id/edit', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).send('Product not found');
  const brands = db.prepare('SELECT * FROM brands ORDER BY name').all();
  const models = db.prepare('SELECT * FROM models ORDER BY name').all();
  res.render('admin/product-form', { page: 'admin-products', product, brands, models, errors: null });
});

router.post('/products/:id/edit', upload.single('image'), (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).send('Product not found');

  const { name, category, description, price, stock, brand_id, model_id, featured } = req.body;
  const errors = [];
  if (!name || !name.trim()) errors.push('Product name is required.');
  if (price === undefined || price === '' || isNaN(Number(price))) errors.push('Enter a valid price.');

  if (errors.length) {
    const brands = db.prepare('SELECT * FROM brands ORDER BY name').all();
    const models = db.prepare('SELECT * FROM models ORDER BY name').all();
    return res.render('admin/product-form', {
      page: 'admin-products',
      product: { ...existing, ...req.body },
      brands,
      models,
      errors,
    });
  }

  let imagePath = existing.image;
  if (req.file) {
    imagePath = `/uploads/${req.file.filename}`;
    // Clean up the old image file so uploads don't accumulate forever.
    if (existing.image) {
      const oldPath = path.join(__dirname, '..', 'public', existing.image);
      fs.unlink(oldPath, () => {});
    }
  }

  db.prepare(
    `UPDATE products SET name=?, category=?, description=?, price=?, stock=?, image=?, brand_id=?, model_id=?, featured=?
     WHERE id=?`
  ).run(
    name.trim(),
    (category || '').trim() || null,
    (description || '').trim() || null,
    Number(price),
    stock ? Number(stock) : 0,
    imagePath,
    brand_id || null,
    model_id || null,
    featured ? 1 : 0,
    req.params.id
  );

  res.redirect('/admin/products');
});

router.post('/products/:id/delete', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (product && product.image) {
    const imgPath = path.join(__dirname, '..', 'public', product.image);
    fs.unlink(imgPath, () => {});
  }
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.redirect('/admin/products');
});

// ---------- Brand / model quick management ----------
router.get('/brands', (req, res) => {
  const brands = db
    .prepare(
      `SELECT b.*, (SELECT COUNT(*) FROM models m WHERE m.brand_id = b.id) AS model_count
       FROM brands b ORDER BY b.name`
    )
    .all();
  const models = db
    .prepare(`SELECT m.*, b.name AS brand_name FROM models m JOIN brands b ON m.brand_id = b.id ORDER BY b.name, m.name`)
    .all();
  res.render('admin/brands', { page: 'admin-brands', brands, models, error: null });
});

router.post('/brands/new', (req, res) => {
  const name = (req.body.name || '').trim();
  if (name) {
    try {
      db.prepare('INSERT INTO brands (name) VALUES (?)').run(name);
    } catch (e) {
      // Ignore duplicate brand names.
    }
  }
  res.redirect('/admin/brands');
});

router.post('/brands/:id/delete', (req, res) => {
  db.prepare('DELETE FROM brands WHERE id = ?').run(req.params.id);
  res.redirect('/admin/brands');
});

router.post('/models/new', (req, res) => {
  const name = (req.body.name || '').trim();
  const brandId = req.body.brand_id;
  if (name && brandId) {
    try {
      db.prepare('INSERT INTO models (brand_id, name) VALUES (?, ?)').run(brandId, name);
    } catch (e) {
      // Ignore duplicates.
    }
  }
  res.redirect('/admin/brands');
});

router.post('/models/:id/delete', (req, res) => {
  db.prepare('DELETE FROM models WHERE id = ?').run(req.params.id);
  res.redirect('/admin/brands');
});

// ---------- Order management ----------
router.get('/orders', (req, res) => {
  const orders = db
    .prepare(
      `SELECT o.*, p.name AS product_name, b.name AS branch_name, b.region AS branch_region
       FROM orders o
       LEFT JOIN products p ON o.product_id = p.id
       LEFT JOIN branches b ON o.branch_id = b.id
       ORDER BY o.created_at DESC`
    )
    .all();
  res.render('admin/orders', { page: 'admin-orders', orders });
});

router.post('/orders/:id/status', (req, res) => {
  const { status } = req.body;
  const allowed = ['Pending', 'Confirmed', 'Ready for Pickup', 'Completed', 'Cancelled'];
  if (allowed.includes(status)) {
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
  }
  res.redirect('/admin/orders');
});

// ---------- Messages ----------
router.get('/messages', (req, res) => {
  const messages = db.prepare('SELECT * FROM messages ORDER BY created_at DESC').all();
  res.render('admin/messages', { page: 'admin-messages', messages });
});

router.post('/messages/:id/read', (req, res) => {
  db.prepare('UPDATE messages SET is_read = 1 WHERE id = ?').run(req.params.id);
  res.redirect('/admin/messages');
});

router.post('/messages/:id/delete', (req, res) => {
  db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
  res.redirect('/admin/messages');
});

// ---------- Announcements ----------
router.get('/announcements', (req, res) => {
  const announcements = db.prepare('SELECT * FROM announcements ORDER BY created_at DESC').all();
  res.render('admin/announcements', { page: 'admin-announcements', announcements, errors: null });
});

router.post('/announcements/new', (req, res) => {
  const { title, body } = req.body;
  const errors = [];
  if (!title || !title.trim()) errors.push('Title is required.');
  if (!body || !body.trim()) errors.push('Announcement text is required.');

  if (errors.length) {
    const announcements = db.prepare('SELECT * FROM announcements ORDER BY created_at DESC').all();
    return res.render('admin/announcements', { page: 'admin-announcements', announcements, errors });
  }

  db.prepare('INSERT INTO announcements (title, body, active) VALUES (?, ?, 1)').run(title.trim(), body.trim());
  res.redirect('/admin/announcements');
});

router.post('/announcements/:id/toggle', (req, res) => {
  const a = db.prepare('SELECT * FROM announcements WHERE id = ?').get(req.params.id);
  if (a) {
    db.prepare('UPDATE announcements SET active = ? WHERE id = ?').run(a.active ? 0 : 1, req.params.id);
  }
  res.redirect('/admin/announcements');
});

router.post('/announcements/:id/delete', (req, res) => {
  db.prepare('DELETE FROM announcements WHERE id = ?').run(req.params.id);
  res.redirect('/admin/announcements');
});

module.exports = router;
