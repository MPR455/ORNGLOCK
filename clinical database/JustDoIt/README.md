# Clinical database · JustDoIt

Order data behind the **order** tab on <https://mpr455.github.io/ORNGLOCK/>.
Each of the 38 chapters becomes a short menu of conditions, and each
condition lists what to order: 💊 medications, 🧪 labs, 📷 exams/imaging and
⚙️ bedside procedures, each with a one-line reason.

The entries are condensed and rewritten from the
值班冒險 速看指引 (AI-generated,
not reviewed line by line by a person). They are for teaching, not medical
advice: check doses against the hospital formulary and the patient's renal and
hepatic function.

## Layout

```
chapters/NN-slug.json   one file per chapter (edit these)
home.json               home screen: 🚨 urgent shortcuts straight to a condition,
                        then tiles grouped by how the call comes in (vitals,
                        symptoms, lab values, drug requests); every chapter
                        must appear in exactly one section
formulary.json          on-call subset of the hospital formulary: generic name,
                        strengths stocked, match regex (no item codes)
formulary-check.mjs     every 💊 order may only name formulary drugs, and every
                        formulary drug must be used by some order (npm test)
build-data.mjs          checks the chapter files and home.json, then bundles them
justdoit-data.mjs       generated module the site imports (do not edit)
```

## Chapter format

```json
{
  "no": "33", "slug": "potassium", "title": "鉀", "icon": "🍌",
  "items": [
    { "name": "高血鉀 K ≥6.0", "hint": "short trigger shown under the name",
      "orders": [
        ["m", "Order text as it would be written", "why (shown in the ? popup)", "situation tag"]
      ] }
  ]
}
```

- Optional `sources`: list of guidelines the chapter was checked against (not shown in the tab).
- Order type: `m` medication, `l` lab, `x` exam or imaging, `p` procedure or bedside action.
- The fourth field is optional. Orders that have it are alternatives for a
  specific situation (for example `無 IV`), so **＋ 基本醫囑** skips them and
  the user picks them by hand.

## After editing a chapter

```bash
node "clinical database/JustDoIt/build-data.mjs"
npm test
```

`npm test` fails if `justdoit-data.mjs` is out of date with the chapter files.
