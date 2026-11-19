# LASLAS 24

A neighbourhood storefront with a basket, checkout, inventory, and sales reporting.

## Architecture

| Layer | Implementation |
| --- | --- |
| Frontend | Three HTML pages, shared responsive CSS, and vanilla JavaScript. |
| Backend | Node.js 20.12+ and Express 5. The API validates Supabase access tokens and passes the caller's credentials to PostgreSQL. |
| Database | Supabase PostgreSQL with SQL migrations and row-level security. Checkout calculates prices in PostgreSQL and records the order and inventory changes in one transaction. |
| Authentication | Supabase Auth handles email/password sign-up, sign-in, invitations, and password recovery. A private database table grants admin access. |
| File imports | Multer handles uploads. SheetJS reads CSV and XLSX. |
| Images | The product editor accepts public HTTPS URLs from Cloudflare R2 or Supabase Storage. |
| Hosting | Vercel serves the static frontend and runs Express for API requests. |
| Tooling | npm and the Node.js built-in test runner. |

The storefront records orders and the customer's payment method for collection. The reference stack's event authorization and QR check-in, PayFast ticket payments, SMTP ticket delivery, and Apple Wallet and Google Wallet passes apply to a future event or ticketing workflow.

## Set up Supabase

1. Create a Supabase project and apply the SQL in `supabase/migrations/20261119000100_store.sql` with your migration workflow. You may also run `supabase/seed.sql` once to load the sample inventory.
2. Enable email/password authentication. Set **Site URL** to your deployed origin and allow the account callbacks at `http://localhost:3000/auth.html` and your deployed `/auth.html`. Configure a custom SMTP provider in Supabase Auth for production signup, invitation, and recovery emails.
3. Create and confirm the first account. Run the SQL below as the project owner with that user's UUID from the Supabase Auth dashboard. Invitation recipients start as regular customers.

```sql
insert into private.admins (user_id) values ('<user-uuid>');
```

[Supabase Auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls) · [Supabase Auth SMTP](https://supabase.com/docs/guides/auth/auth-smtp)

## Run locally

```powershell
Copy-Item .env.example .env
npm ci
npm start
```

Fill in `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in `.env` before opening [http://localhost:3000](http://localhost:3000). Set `SUPABASE_SECRET_KEY` and `APP_ORIGIN` to enable admin invitations. The secret belongs in the server environment.

```powershell
npm test
npm run build
```

The build copies the frontend and browser SDK to `public/` for hosting. Shared inventory and orders are loaded from Supabase. The browser keeps the current user's basket locally. Data from the earlier browser-only demo stays in that browser.

## Admin imports and images

Import a CSV or XLSX from the admin page. Use columns `name`, `category`, `price`, and `stock`, with optional `icon` and `image_url`. Each import accepts up to 500 products and 2 MiB. An invalid row rejects the whole import.

For images, upload catalogue files to your Cloudflare R2 or Supabase Storage bucket and paste the public HTTPS URL into **Product image URL**. Products use their configured icon when an image is absent or fails to load. [Cloudflare R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/) · [Supabase Storage public assets](https://supabase.com/docs/guides/storage/serving/downloads)

## Deploy to Vercel

Import the repository into a Vercel project. The checked-in `vercel.json` selects Express and builds the public assets. Add the server environment variables from `.env.example` and set `APP_ORIGIN` to the deployed site origin. Add the deployed Auth redirect URL to Supabase before testing account emails. [Express on Vercel](https://vercel.com/docs/frameworks/backend/express)

## Project layout

- `index.html`, `admin.html`, `auth.html` contain the storefront, dashboard, and account screens.
- `assets/` contains shared styles, images, and frontend JavaScript.
- `app.js` defines the Express application. `start.js` starts the local server.
- `server/` contains validation and spreadsheet handling.
- `supabase/` contains the SQL migration and optional sample data.
- `test/` contains input validation and API tests.
