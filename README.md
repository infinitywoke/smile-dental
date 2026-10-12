# Smile Dental Clinic: website + Clinic OS

- **Website:** the public site for Smile Dental Clinic, Katapadi.
- **Clinic OS** (`/app`): a phone-first app where Dr. Rahil books patients, records visits, photos, bills and payments, and sends the WhatsApp message. Sign-in is email + password.

## Getting started

1. Follow [SETUP.md](SETUP.md) to create the Supabase project and the login account, and to fill in `.env.local`.
2. Install and run:
   ```bash
   npm install
   npm run dev
   ```
3. Open http://localhost:3000 for the website, or http://localhost:3000/app for Clinic OS.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
