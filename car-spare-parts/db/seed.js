// db/seed.js
// Run once with: npm run seed
// Creates the first admin account and a small set of sample brands/models/
// branches so the site isn't empty on first run. Safe to re-run — it skips
// anything that already exists.

require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./database');

function seedAdmin() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';

  const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(username);
  if (existing) {
    console.log(`Admin user "${username}" already exists — skipping.`);
    return;
  }
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run(username, hash);
  console.log(`Created admin user "${username}". Log in at /admin/login`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log('WARNING: using default password "admin123" — set ADMIN_PASSWORD in your .env before deploying.');
  }
}

function seedBrandsAndModels() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM brands').get().c;
  if (count > 0) {
    console.log('Brands already seeded — skipping.');
    return;
  }
  const brandData = {
    BMW: ['3 Series', '5 Series', 'X5', 'X3'],
    Toyota: ['Corolla', 'Camry', 'Hilux', 'RAV4'],
    'Mercedes-Benz': ['C-Class', 'E-Class', 'GLE'],
    Honda: ['Civic', 'Accord', 'CR-V'],
  };
  const insertBrand = db.prepare('INSERT INTO brands (name) VALUES (?)');
  const insertModel = db.prepare('INSERT INTO models (brand_id, name) VALUES (?, ?)');
  const seedAll = db.transaction(() => {
    for (const [brand, models] of Object.entries(brandData)) {
      const info = insertBrand.run(brand);
      for (const m of models) insertModel.run(info.lastInsertRowid, m);
    }
  });
  seedAll();
  console.log('Seeded sample brands and models.');
}

function seedBranches() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM branches').get().c;
  if (count > 0) {
    console.log('Branches already seeded — skipping.');
    return;
  }
  const branches = [
    ['Accra Main Branch', 'Greater Accra', 'Spintex Road, Accra'],
    ['Kumasi Branch', 'Ashanti', 'Adum, Kumasi'],
    ['Takoradi Branch', 'Western', 'Market Circle, Takoradi'],
  ];
  const insert = db.prepare('INSERT INTO branches (name, region, address) VALUES (?, ?, ?)');
  const seedAll = db.transaction(() => {
    for (const b of branches) insert.run(...b);
  });
  seedAll();
  console.log('Seeded sample branches.');
}

seedAdmin();
seedBrandsAndModels();
seedBranches();
console.log('Seeding complete.');
