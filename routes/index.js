// routes/index.js
// All customer-facing (non-admin) pages.

const express = require('express');
const router = express.Router();
const db = require('../db/database');

// Make active announcements available to every user-facing view.
router.use((req, res, next) => {
  res.locals.announcements = db
    .prepare('SELECT * FROM announcements WHERE active = 1 ORDER BY created_at DESC')
    .all();
  next();
});

// ---------- Home ----------
router.get('/', (req, res) => {
  const featured = db
    .prepare('SELECT * FROM products WHERE featured = 1 ORDER BY created_at DESC LIMIT 8')
    .all();

  const brands = db
    .prepare(
      `SELECT b.id, b.name,
              (SELECT COUNT(*) FROM models m WHERE m.brand_id = b.id) AS model_count
       FROM brands b ORDER BY b.name`
    )
    .all();

  // Group models under each brand for the "Category Section".
  const modelsByBrand = {};
  const allModels = db.prepare('SELECT * FROM models ORDER BY name').all();
  for (const m of allModels) {
    if (!modelsByBrand[m.brand_id]) modelsByBrand[m.brand_id] = [];
    modelsByBrand[m.brand_id].push(m);
  }

  res.render('index', {
    page: 'home',
    featured,
    brands,
    modelsByBrand,
  });
});

// ---------- Search ----------
router.get('/search', (req, res) => {
  const q = (req.query.q || '').trim();
  let results = [];
  if (q) {
    results = db
      .prepare(
        `SELECT p.*, b.name AS brand_name, m.name AS model_name
         FROM products p
         LEFT JOIN brands b ON p.brand_id = b.id
         LEFT JOIN models m ON p.model_id = m.id
         WHERE p.name LIKE ? OR p.description LIKE ? OR p.category LIKE ?
         ORDER BY p.name`
      )
      .all(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  res.render('search-results', { page: 'search', q, results });
});

// ---------- About ----------
router.get('/about', (req, res) => {
  res.render('about', { page: 'about' });
});

// ---------- Products ----------
router.get('/products', (req, res) => {
  const brandId = req.query.brand ? Number(req.query.brand) : null;

  let products;
  if (brandId) {
    products = db
      .prepare(
        `SELECT p.*, b.name AS brand_name, m.name AS model_name
         FROM products p
         LEFT JOIN brands b ON p.brand_id = b.id
         LEFT JOIN models m ON p.model_id = m.id
         WHERE p.brand_id = ?
         ORDER BY p.created_at DESC`
      )
      .all(brandId);
  } else {
    products = db
      .prepare(
        `SELECT p.*, b.name AS brand_name, m.name AS model_name
         FROM products p
         LEFT JOIN brands b ON p.brand_id = b.id
         LEFT JOIN models m ON p.model_id = m.id
         ORDER BY p.created_at DESC`
      )
      .all();
  }

  const modelCount = db.prepare('SELECT COUNT(*) AS c FROM models').get().c;
  const brands = db.prepare('SELECT * FROM brands ORDER BY name').all();

  res.render('products', {
    page: 'products',
    products,
    modelCount,
    brands,
    activeBrand: brandId,
  });
});

// ---------- Product detail ----------
router.get('/products/:id', (req, res) => {
  const product = db
    .prepare(
      `SELECT p.*, b.name AS brand_name, m.name AS model_name
       FROM products p
       LEFT JOIN brands b ON p.brand_id = b.id
       LEFT JOIN models m ON p.model_id = m.id
       WHERE p.id = ?`
    )
    .get(req.params.id);

  if (!product) {
    return res.status(404).render('404', { page: '404' });
  }
  res.render('product-detail', { page: 'products', product });
});

// ---------- Contact ----------
router.get('/contact', (req, res) => {
  res.render('contact', {
    page: 'contact',
    sent: false,
    errors: null,
    company: {
      email: process.env.COMPANY_EMAIL || 'info@yourcompany.com',
      phone: process.env.COMPANY_PHONE || '+233 20 000 0000',
      address: process.env.COMPANY_ADDRESS || 'Accra, Ghana',
    },
  });
});

router.post('/contact', (req, res) => {
  const { name, email, message } = req.body;
  const errors = [];
  if (!name || !name.trim()) errors.push('Please enter your name.');
  if (!email || !email.trim()) errors.push('Please enter your email.');
  if (!message || !message.trim()) errors.push('Please enter a message.');

  const company = {
    email: process.env.COMPANY_EMAIL || 'info@yourcompany.com',
    phone: process.env.COMPANY_PHONE || '+233 20 000 0000',
    address: process.env.COMPANY_ADDRESS || 'Accra, Ghana',
  };

  if (errors.length) {
    return res.render('contact', { page: 'contact', sent: false, errors, company });
  }

  db.prepare('INSERT INTO messages (name, email, message) VALUES (?, ?, ?)').run(
    name.trim(),
    email.trim(),
    message.trim()
  );

  res.render('contact', { page: 'contact', sent: true, errors: null, company });
});

// ---------- Checkout ----------
router.get('/checkout/:productId', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.productId);
  if (!product) {
    return res.status(404).render('404', { page: '404' });
  }
  const branches = db.prepare('SELECT * FROM branches ORDER BY region, name').all();
  res.render('checkout', { page: 'checkout', product, branches, errors: null });
});

router.post('/checkout/:productId', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.productId);
  if (!product) {
    return res.status(404).render('404', { page: '404' });
  }

  const {
    customer_name,
    customer_email,
    customer_phone,
    payment_method,
    branch_id,
  } = req.body;

  const errors = [];
  if (!customer_name || !customer_name.trim()) errors.push('Please enter your full name.');
  if (!customer_phone || !customer_phone.trim()) errors.push('Please enter a phone number.');
  if (!['Online', 'Walk-in'].includes(payment_method)) errors.push('Please choose a payment method.');
  if (!branch_id) errors.push('Please select a branch/region.');

  if (errors.length) {
    const branches = db.prepare('SELECT * FROM branches ORDER BY region, name').all();
    return res.render('checkout', { page: 'checkout', product, branches, errors });
  }

  let modelName = null;
  if (product.model_id) {
    const modelRow = db.prepare('SELECT name FROM models WHERE id = ?').get(product.model_id);
    modelName = modelRow ? modelRow.name : null;
  }

  const info = db
    .prepare(
      `INSERT INTO orders
        (product_id, customer_name, customer_email, customer_phone, model_name, part_type, payment_method, branch_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`
    )
    .run(
      product.id,
      customer_name.trim(),
      (customer_email || '').trim(),
      customer_phone.trim(),
      modelName,
      product.category || null,
      payment_method,
      branch_id
    );

  res.render('checkout-success', {
    page: 'checkout',
    orderId: info.lastInsertRowid,
    product,
    paymentMethod: payment_method,
  });
});

module.exports = router;
