// server.js
// Entry point for the car spare parts website.

require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');

const indexRoutes = require('./routes/index');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- View engine ----------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ---------- Core middleware ----------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 8, // 8 hours
      // secure: true, // enable once the site is served over HTTPS on Render
    },
  })
);

// Make the current path available to all views (for nav highlighting).
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  next();
});

// ---------- Routes ----------
app.use('/admin', adminRoutes);
app.use('/', indexRoutes);

// ---------- 404 ----------
app.use((req, res) => {
  res.status(404).render('404', { page: '404' });
});

// ---------- Error handler ----------
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Something went wrong. Please try again.');
});

app.listen(PORT, () => {
  console.log(`Car spare parts site running on http://localhost:${PORT}`);
});
