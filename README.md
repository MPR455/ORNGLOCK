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

## 交班單 workspace

The 交班單 tab supports manual patient entry, CSV/TSV and ward-text import, and reimport of downloaded TXT files. Import previews reconcile by chart number or a safe unique name match; bed updates preserve existing note bodies. Conflicting identities are shown for review. The observed ER sample requires Big5 decoding. Real local samples are ignored by Git and excluded from the public build.

Patient cards include bed, chart number, name, age, and a quick remark synchronized with the note header. The left pane supports bed/important/pending sorting, expansion, and patient-grouped task editing. Checking a pending item moves that edited line and its continuation into the same patient's [O]: section without inventing a result. Individual and continuous views share one document model. Continuous notes and whole-list TXT downloads always follow floor/ward/bed order.

Drag the visible **⠿** handle beside a `-` or `#` block to move the entire block, including continuation lines and highlights. Drop indicators snap before/after blocks; moving between sections is supported within the same patient. Handle clicks offer a keyboard-accessible section move, and Alt+Up/Down moves blocks. Cross-patient drops are blocked.

The three highlighters apply **background color to selected text**, like Word. With a collapsed caret, a color activates repeated-selection paint mode; Escape stops painting. No color removes only the selected background. `@` opens an editable Taiwan-date picker with Left/Right day stepping. `<Exam>` normalizes identifiable examination-label lines to angle-bracket notation.

Deleting first opens a confirmation naming the patient's bed, name, and chart number, with Cancel focused. Confirming removes the complete patient record: card, note, tasks, continuous-view content, download content, and that patient's AI scratchpad. Late AI responses cannot recreate it. Undo restores the record. Notes remain in page memory; export TXT before closing/reloading.

### Handoff AI configuration

The floating AI panel offers Note convert, Data cleaning, and Order with Current-only copying. Drafts are bound to their original patient and require a comparison before note replacement/data insertion. The three private master prompts are loaded only by the backend. Handoff availability is independent of the original four tools.

Set the separate backend secret `HANDOFF_GEMINI_API_KEY` for handoff calls. An explicitly applied personal key from the existing API key tab takes precedence. The original four tools continue using `GEMINI_API_KEY`. No credential is included in source, public files, TXT exports, or tests.

For local startup, provide the handoff secret in the server environment and run `pnpm start`. The existing `--key-stdin` startup option also accepts a JSON line with `handoffApiKey` and/or `apiKey`; input is not echoed. `.env.example` documents variable names but is not automatically loaded by the Node local server.

For the deployed Worker, use `pnpm exec wrangler secret put HANDOFF_GEMINI_API_KEY` with its hidden prompt. See [Cloudflare's secrets documentation](https://developers.cloudflare.com/workers/configuration/secrets/). Keep the seven private prompt text files available locally when bundling/deploying the backend. GitHub Pages never includes them. Local implementation does not publish a new Pages/Worker deployment.

### Portable TXT highlighting

Ordinary spans serialize as `/red/`, `%yellow%`, and `\green\`. Dates, units, percentages, and URLs remain literal. Ambiguous literal delimiters use a small, single-decoded entity escape set. Partial-word or adjacent Word selections that cannot be represented unambiguously use the lossless extension `{{mark:red}}text{{/mark}}` (also yellow/green). Import restores those backgrounds. This is text syntax, never executable HTML. The exact `{pending}` marker remains readable in exported notes.

### Handoff verification

Run `pnpm test` and `pnpm build`. Behavioral tests cover private sample decoding locally (skipped when absent in CI), synthetic CSV/ward/TXT formats, identity conflicts, bed/header preservation, task movement, block movement, background-mark round trips, deletion/undo, continuous ordering, date arithmetic, separate shared-key routing, context validation, and optional readiness. Browser checks exercise actual mouse block dragging, caret continuity, Word-style highlighting, confirmation defaults, AI draft targeting, and downloads after deletion. Live model smoke tests use synthetic data only; they do not establish clinical validation.
