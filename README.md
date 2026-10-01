# PinSphere

PinSphere organizes places into maps, submaps, and location pins. Shared maps support owner, editor, and viewer roles, invitations, and collaboration.

Built with React, Vite, MapLibre, and Supabase Auth and database services.

## Local development

Install dependencies with `npm install`. Create a local `.env` file containing:

```dotenv
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_KEY=your-supabase-publishable-or-anon-key
```

Use a client-safe key, never a service-role key. The `.env` file is ignored by Git.

Run `npm run dev` to start the development server.

## Checks and production build

- `npm run lint` checks the frontend with ESLint.
- `npm run build` creates the production build in `dist`.
- `npm run preview` serves the production build locally.

## Supabase

Authentication uses Supabase's built-in session persistence. Database access is controlled by Supabase row-level security policies and RPCs.

`supabase/pin-permissions.sql` contains the pin permission SQL prepared for this project. It is not automatically applied by the frontend or build; inspect the live database before applying policy changes.
