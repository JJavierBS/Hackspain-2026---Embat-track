# X-Ray frontend

React 19, TypeScript, Vite, TanStack Query, Recharts, Tailwind 4.

```bash
npm install
npm run dev        # :5173, proxies /api to the backend on :8080
npm run build      # tsc -b && vite build
npm run typecheck
npm run lint       # oxlint
```

**Use npm.** `package-lock.json` is the lockfile in git. A `pnpm-lock.yaml` on disk is ignored on
purpose: Vercel picks its package manager from the lockfile it finds, so a second one changes how
production builds.

The app reads `/api` same-origin. In development Vite proxies it; on Vercel `vercel.json` rewrites it
to the Render service, which is why the backend needs no CORS (`../docs/DEPLOY.md`).

What the pages show, and the rules behind every number: `../README.md` and `../docs/DECISIONS.md`.
The design system is `../docs/DESIGN.md`.
