# Car Spare Parts Website

A multi-page car spare parts website with a customer-facing storefront and an
admin panel, built with Node.js, Express, EJS, and SQLite.

## Features

**Customer site**
- Home page: featured products, brand/model category section, search
- About page
- Products page: full catalogue, filter by brand, shows total model count
- Product detail page
- Contact page with a message form
- Checkout flow: choose Online or Walk-in payment, then select a branch/region

**Admin panel** (`/admin`)
- Login-protected (session-based)
- Product management: add/edit/delete, image upload
- Brand & model management (powers the category section and filters)
- Order management: view all orders with customer, payment, and branch
  details; update order status
- Messages: view messages sent through the Contact form
- Announcements: post/toggle/delete notices shown in a banner on every
  customer-facing page

## Local setup

```bash
npm install
cp .env.example .env
# edit .env — set ADMIN_USERNAME / ADMIN_PASSWORD at minimum
npm run seed     # creates the admin account + sample brands/models/branches
npm start
```

Visit `http://localhost:3000` for the storefront and
`http://localhost:3000/admin/login` for the admin panel.

## Deploying to Render

1. Push this project to a GitHub repository.
2. In Render, create a new **Web Service** from that repo.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add Environment Variables (Render dashboard → Environment) matching
   `.env.example`: `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`,
   `COMPANY_EMAIL`, `COMPANY_PHONE`, `COMPANY_ADDRESS`.
6. After the first deploy, run the seed script once using Render's Shell tab:
   `npm run seed`

### If the build fails on `better-sqlite3` (node-gyp / make error)

`better-sqlite3` ships prebuilt binaries for common Node versions. If Render
assigns a very new/uncommon Node version, no prebuilt binary exists yet, so
npm tries to compile it from source — and that compile step can fail on
Render's build image.

This project already pins Node to a known-good version two ways:
- `.node-version` file (set to `20.18.0`)
- `"engines": { "node": "20.x" }` in `package.json`

Render reads `.node-version` automatically. If your build still fails after
pulling the latest project files, double-check in Render's **Environment**
tab that there's no separate `NODE_VERSION` variable overriding it with
something newer — if there is, delete it or set it to `20.18.0` too, then
trigger **Manual Deploy → Clear build cache & deploy**.

If it *still* fails after that, the most reliable fallback is to swap
`better-sqlite3` (native/compiled) for `sql.js` or `nedb`/`lowdb`
(pure-JavaScript, no compilation needed) — ask and this can be converted.

### Important: persistent storage on Render

Render's free web service disk is **ephemeral** — the SQLite database file
and any uploaded product images are wiped every time the service redeploys
or restarts. For a real production launch, do one of the following:

- **Simplest fix:** attach a [Render Persistent Disk](https://render.com/docs/disks)
  to this service, mounted at e.g. `/data`, then set the environment variable
  `DB_PATH=/data/store.sqlite` and update `middleware/upload.js` to save
  uploads under that same mounted disk instead of `public/uploads`.
- **More scalable fix:** switch the database to Render's managed Postgres
  (would require swapping `better-sqlite3` queries for a Postgres client such
  as `pg`), and store product images in an object storage service like
  Cloudinary, Backblaze B2, or Amazon S3 instead of local disk.

The app works correctly as-is for development, demos, and low-traffic use —
just be aware that data disappears on redeploy until one of the above is set
up.

## Project structure

```
car-spare-parts/
  server.js              # app entry point
  db/
    database.js           # SQLite schema + connection
    seed.js                # creates admin user + sample data
  middleware/
    auth.js                 # admin session guard
    upload.js               # multer image upload config
  routes/
    index.js                # customer-facing routes
    admin.js                 # admin panel routes
  views/                   # EJS templates (customer + views/admin)
  public/
    css/                     # stylesheets
    uploads/                 # uploaded product images (gitignored)
```

## Default admin login

After running `npm run seed`, log in at `/admin/login` with the
`ADMIN_USERNAME` / `ADMIN_PASSWORD` you set in `.env`. Change these before
deploying publicly.
