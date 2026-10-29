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

## Study decks

The **Study** tab reads Anki `.apkg` decks on demand. It follows OPH Study's card reader with ORNGLOCK Order's square controls, large text, and shared color themes. Features include categories, shuffle, search, answer reveal, card/list browsing, card-number navigation, and saved study position on this browser. Reader libraries are bundled locally; no CDN is needed to open a deck.

Put decks in folders directly inside `decks/`. Each folder becomes a book labeled with the exact folder name. Subfolders inside a book are also scanned. For example:

```text
decks/
  內科會考/
    內科會考_114年.apkg
  急專/
    ER_MCQ_114-100_by_category2.apkg
  Another book/
    Another deck.apkg
```

No deck list needs editing. During `npm start`, **Refresh books** rescans local folders immediately. On GitHub Pages, commit/push the new folders and decks to `main`; the existing Pages workflow scans and publishes them on every build. The deployed site updates after that deployment. A hosted browser cannot read folders on your computer until their files are published. Removing a deck also removes it from the next generated build.

**Refresh books** sits alongside the book buttons. **Hide books & decks** collapses the book and deck controls while keeping your selection and loaded cards; **Show books & decks** restores them. Extra books scroll horizontally when needed.

**Focus mode** fills the browser page and hides the top banner, book/deck controls, filters, card browser, and mobile navigation. Questions, answers, previous/next, and an exit control remain visible. The browser's tabs, address bar, and window stay available. Press **F** to toggle focus and **Esc** to exit. Use **A / ←** for previous, **S / Space / ↓** to reveal, and **D / →** for next, outside text fields.

Click any deck image to open a floating viewer. Use its **+/−** controls, the mouse wheel, or a pinch gesture to zoom; drag to pan. Double-click toggles zoom/reset, **Fit / 0** resets the view, and **Esc** closes it. The viewer also works in focus mode.

APKG reading supports Anki 2.0/2.1 SQLite exports, including cloze cards, embedded images/audio, and model styles. For newer compressed Anki exports, re-export with **Support older Anki (2.0)** enabled. **Open .apkg** reads a local file in your browser without uploading it.

## Shared-key fallback

The shared key is the default. A shared quota, invalid-key, or permissions error produces a clear message and an **Use my API key** option. Source notes and previous output are kept. The visitor explicitly selects their key, returns to the notes, and runs a document button again. The app never silently switches between keys or repeatedly retries a billable call.

## Verification

In **交班單 → 匯入病人名單**, the option below **或貼上名單** opens **AI 轉換其他人的交班筆記**. Upload a TXT file (UTF-8, Big5 or UTF-16) or paste another author's messy notes. Conversion makes a best-effort draft using ORNGLOCK's divider, identity row and six sections. Empty beds are skipped, mixed headings and compact age/sex are normalized, and missing fields remain 待補. Incomplete sections and identity differences produce review notes without blocking **套入**. Unassigned clinical fragments remain separate editable entries. The draft is always displayed before import parsing. The result goes through the per-patient import preview; existing notes are replaced only when explicitly selected, and importing can be undone. Closing and reopening the converter retains its source, draft and provider notices in tab memory. Conversion uses the handoff key, personal-key selection, and existing request limits; source is sent to the backend and Google. The source limit is 100,000 characters. Whole-list conversion allows up to 32,768 output tokens and 180 seconds at the backend (190 seconds in the browser). If output reaches its token limit, the partial draft remains editable and importable with a notice that patients or content may remain; convert the remaining source separately. Review all patients before applying; format normalization does not establish clinical accuracy.

```powershell
npm test
npm run build
```

Tests cover the four prompt mappings, shared-to-personal fallback, key and prompt exposure, request limits, CORS, invalid input, provider errors, blocked/truncated output, timeouts, and real local HTTP routing. Live model quality needs checking with representative de-identified cases. The tests do not claim clinical validation.

## 交班單 workspace

The 交班單 tab supports manual patient entry, CSV/TSV and ward-text import, and reimport of downloaded TXT files. Import previews reconcile by chart number or a safe unique name match; bed updates preserve existing note bodies. Conflicting identities are shown for review. The observed ER sample requires Big5 decoding. Real local samples are ignored by Git and excluded from the public build.

Patient cards include bed, chart number, name, age, and a quick remark synchronized with the note header. The left pane supports bed/important/pending sorting and patient-grouped task editing. Expansion fills the page with larger cards showing history, current issues, assessment, plan, and pending/important lines; 展開 becomes a red 還原 immediately left of 床號, and Escape activates 還原 when no modal is open. Checking a pending item moves that edited line and its continuation into the same patient's [O]: section without inventing a result. Individual and continuous views share one document model. Continuous notes and whole-list TXT downloads always follow floor/ward/bed order.

縮小 minimizes the left pane to a narrow bed/name strip, keeping patient selection available and giving the editor more room. 還原 returns to normal width. Narrow editor layouts keep that strip visible with 展開 and 還原 controls; there is no ← 病人 toolbar button.

Every editor-toolbar button is 44px high. Desktop layouts keep the mode, highlighters, pending, sex, DNR, and undo/redo controls available in a single row; the editing group can scroll horizontally if space is tight, while the robot, fullscreen icon, and download remain visible. Only small windows (760px or less) hide the editing group and show the robot, fullscreen icon, and 下載. The fullscreen icon immediately left of 下載 toggles the top site banner for the handoff workspace and expands the usable editor height; clicking again or pressing Escape restores it.

Continuous mode is the default. 性別 and DNR beside `{pending}` update the selected patient's header and card with an explicit male/female or DNR1/DNR2/DNR3 selection; neither is inferred. 待辦事項 uses a red button and a red outline around the active task pane.

Drag the visible **⠿** handle beside a `-` or `#` block above or below another handle to move the entire block, including continuation lines, highlights, and pending markers. The empty gutter between handles and text rows also accepts drops; insertion indicators appear beside the target handle and text block. Moving between sections is supported within the same patient. Clicking a handle opens no popup; Alt+Up/Down moves blocks by keyboard. Cross-patient drops are blocked.

The three highlighters apply **background color to selected text**, like Word. With a collapsed caret, a color activates repeated-selection paint mode; Escape stops painting. No color removes only the selected background. `@` opens an editable Taiwan-date picker with Left/Right day stepping.

Deleting first opens a confirmation naming the patient's bed, name, and chart number, with Cancel focused. Confirming removes the complete patient record: card, note, tasks, continuous-view content, download content, and that patient's AI scratchpad. Late AI responses cannot recreate it. Undo restores the record. Notes remain in page memory; export TXT before closing/reloading.

### Handoff AI configuration

GitHub Pages and the API are deployed separately. Pushing frontend changes does not update the Worker. When adding or changing AI actions/private prompts, deploy the Worker from the local checkout and verify `/api/status` lists all three ready handoff actions before publishing the corresponding UI.

The robot button opens a full-page AI workspace with a blank source input, Note convert, Data cleaning, and Order with Current-only copying. The patient dropdown and previous/next buttons follow bed order. Switching patients cancels the previous request and clears its source, result, and status. The result appears only in 整理結果（可編輯）, with no duplicate preview. Note conversion always preserves existing facts and unresolved tasks; factual fidelity is required by all three private master prompts. 套用 applies the edited note directly with undo, after checking patient identity, required sections, and that the original note has not changed since generation; a stale draft leaves the note intact and asks for regeneration. Data cleaning's 插入 [O] inserts directly into the selected patient's latest objective section and supports undo. The three private master prompts are loaded only by the backend. Handoff availability is independent of the original four tools.

Data cleaning uses the private version 2 lab-only prompt. Results start with `<Lab:M/D Last drawn lab>` using the latest actual requested lab collection date, followed by the requested BG, blood count/coagulation, chemistry, metabolic, microbiology and cardiac groups. Missing tests are skipped. Trends run oldest to newest, and a test whose newest value predates the header gets its own trailing last-result date. BNP and NT-proBNP are included with their own assay labels. The tool omits H/L tags, generated abnormality highlighting, reference ranges, imaging, vitals and unrelated tests. The editable result still inserts directly into [O], exports as plain text, and supports undo. Undated data never inherits the computer's current date.

Set the separate backend secret `HANDOFF_GEMINI_API_KEY` for handoff calls. An explicitly applied personal key from the existing API key tab takes precedence. The original four tools continue using `GEMINI_API_KEY`. No credential is included in source, public files, TXT exports, or tests.

For local startup, provide the handoff secret in the server environment and run `pnpm start`. The existing `--key-stdin` startup option also accepts a JSON line with `handoffApiKey` and/or `apiKey`; input is not echoed. `.env.example` documents variable names but is not automatically loaded by the Node local server.

For the deployed Worker, use `pnpm exec wrangler secret put HANDOFF_GEMINI_API_KEY` with its hidden prompt. See [Cloudflare's secrets documentation](https://developers.cloudflare.com/workers/configuration/secrets/). Keep the seven private prompt text files available locally when bundling/deploying the backend. GitHub Pages never includes them. Local implementation does not publish a new Pages/Worker deployment.

### Portable TXT highlighting

The editor and imports understand `/red/`, `%yellow%`, and `\green\`, plus the lossless extension `{{mark:red}}text{{/mark}}` (also yellow/green) for partial-word/adjacent spans. Dates, units, percentages, and URLs remain literal. These forms are text syntax, never executable HTML. Downloaded handoffs contain plain note text without highlight delimiters or escape entities added for formatting. Highlighting stays in the current editor; plain exports retain `{pending}`, `!`, exam labels, and all patient content.

### Handoff verification

Run `pnpm test` and `pnpm build`. Behavioral tests cover private sample decoding locally (skipped when absent in CI), synthetic CSV/ward/TXT formats, identity conflicts, bed/header preservation, task movement, block movement, background-mark round trips, deletion/undo, continuous ordering, date arithmetic, separate shared-key routing, context validation, and optional readiness. Browser checks exercise actual mouse block dragging, caret continuity, Word-style highlighting, confirmation defaults, AI draft targeting, and downloads after deletion. Live model smoke tests use synthetic data only; they do not establish clinical validation.
