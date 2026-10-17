# ORNGLOCK

A clinical documentation workspace using the shell, colors, themes, cards, and mobile navigation from the supplied CGMH_ER reference page, with ORNGLOCK branding.

Public page: https://mpr455.github.io/ORNGLOCK/

Backend: https://ornglock-api.ornglock.workers.dev

One source input connects to four private master prompts:

1. Admission note
2. Consult request
3. Treatment / weekly summary
4. Current treatment, oxygen, lines, tubes, and devices

The output is editable plain text with copy and download. Source notes, output, and visitor keys remain in browser memory. They are not persisted by this app. Generating sends the source and, when explicitly selected, the visitor key to the backend and Google. Google has its own retention and data-use terms. Use de-identified source material, and review generated documentation before charting.

## Architecture

GitHub Pages serves only `dist/`. A backend adds the private prompt and calls the Gemini API. The browser never receives the shared key or master prompt. This keeps prompts out of page source; it cannot guarantee that a model will never disclose instructions.

The provided `.gitignore` excludes `master prompt/` and local secret files. These prompts were untracked at the time of implementation. Keep them available locally for the backend; do not commit them to a public repository.

## Local preview

Requires Node.js 22 or newer; no package installation is required for the local server, build, or tests.

```powershell
npm start
```

Open `http://127.0.0.1:8787`. Without a shared key, visitors can choose their own key on the API key tab. The four original text files must exist inside `master prompt/`.

To provide an owner key without placing it in shell history or a file, run:

```powershell
$secret = Read-Host 'Gemini API key' -AsSecureString
$env:GEMINI_API_KEY = [System.Net.NetworkCredential]::new('', $secret).Password
npm start
```

Remove the environment value after stopping the server:

```powershell
Remove-Item Env:GEMINI_API_KEY
```

The server also supports `node server/local.mjs --key-stdin` for secure orchestration: send a single JSON line with an `apiKey` property over stdin. It does not echo the value. Keys pasted into chat should be replaced before publication.

Environment configuration:

| Variable | Default | Meaning |
| --- | --- | --- |
| `GEMINI_API_KEY` | none | Backend-only shared Gemini key |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Configurable model ID |
| `PORT` | `8787` | Local listening port |
| `ALLOWED_ORIGINS` | same origin only locally | Comma-separated frontend origins |
| `SHARED_DAILY_LIMIT` | `100` | Maximum shared generation attempts per UTC day |
| `REQUESTS_PER_MINUTE` | `6` | Requests per IP per minute, including personal-key calls |

The local preview counters are in memory and reset when it restarts. The deployed Worker uses a Durable Object for persistent shared quota and per-IP limits. Failed provider attempts count toward the shared limit. This is an application limit, separate from Google's quotas and billing. CORS is not authentication; the shared service is intentionally public and bounded by these limits.

## Backend deployment: Cloudflare Worker

Deployment requires your Cloudflare account. Wrangler is included as a development dependency; install dependencies with `pnpm install` (or `npm install`) before deploying.

1. Authenticate with `npx wrangler login`.
2. Keep the original `master prompt/` directory beside `index.html`. Wrangler bundles its text files into the backend only.
3. Review `wrangler.toml`: set the actual frontend origin and desired request limits. The supplied origin is `https://mpr455.github.io`.
4. Run `npx wrangler deploy` from this directory to create the Worker and its usage counter.
5. Run `npx wrangler secret put GEMINI_API_KEY`, then paste a fresh key at its hidden prompt.
6. Copy the returned HTTPS Worker origin, for example `https://ornglock-api.YOUR-SUBDOMAIN.workers.dev`.

The Worker uses a SQLite Durable Object; ensure that feature is available on your Cloudflare plan. The application does not enable Worker observability or request-body logging. Your hosting account's separate platform configuration still applies.

## GitHub Pages deployment

1. In the GitHub repository, add an Actions **variable** named `ORNGLOCK_API_BASE`, set to the Worker origin. This URL is public configuration, not a secret.
2. Under **Settings → Pages**, select **GitHub Actions** as the publishing source.
3. Commit only the public application, backend source/configuration, tests, and documentation. Never commit the master prompt directory or a key.
4. Push to `main`, or run the supplied Pages workflow manually.

The workflow builds an explicit allowlist of public files into `dist/` and publishes that folder. Backend code and private prompts are excluded. The frontend needs the backend even when a visitor supplies their own key, because the instructions stay there.

For a manual build:

```powershell
$env:ORNGLOCK_API_BASE = 'https://ornglock-api.YOUR-SUBDOMAIN.workers.dev'
npm run build
```

## Shared-key fallback

The shared key is the default. A shared quota, invalid-key, or permissions error produces a clear message and an **Use my API key** option. Source notes and previous output are kept. The visitor explicitly selects their key, returns to the notes, and runs a document button again. The app never silently switches between keys or repeatedly retries a billable call.

## Verification

```powershell
npm test
npm run build
```

Tests cover the four prompt mappings, shared-to-personal fallback, key and prompt exposure, request limits, CORS, invalid input, provider errors, blocked/truncated output, timeouts, and real local HTTP routing. Live model quality needs checking with representative de-identified cases. The tests do not claim clinical validation.
