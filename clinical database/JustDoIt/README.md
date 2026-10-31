# Clinical database · JustDoIt

Order data behind the **order** tab on <https://mpr455.github.io/ORNGLOCK/>.
The 39 clinical chapters and the ICU Lines browser provide short menus of conditions, and each
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
icu-lines.json          shared ICU infusion catalog, source dates, preparation
                        notes, discrepancies and category mappings
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

## ICU Lines

The home screen has an ICU Lines section with an all-lines overview and category
shortcuts. Searching there stays within ICU Lines; the main search also finds the
canonical groups by generic name or brand. The same groups are appended to their
related clinical chapters from `icu-lines.json`, rather than maintained as separate
copies. A stable `orderIds` value keeps a line selected through multiple locations
from being duplicated in the order tray. ICU alternatives are selected individually.

The `?` popup identifies **ICU Line** and includes one consolidated preparation,
dose range and drug-specific details. It does not show source citations, edition
years, version comparisons or generic dilution reminders. The catalog retains
provenance internally from the supplied `ICU lines.pdf` and `iCU meds.pdf` for
maintenance. Inconsistent concentration columns, vial strengths and rate
calculations are not silently reused. These are source transcriptions, not a
newly validated hospital protocol. PDF-only formulary additions say their local
availability needs checking.

Haloperidol and tirofiban infusions are browse-only pending confirmation of
the local protocol (`reviewOnly` in the catalog); their `?` details remain available.
Withdrawn drotrecogin alfa, IV diltiazem absent from the existing formulary, and
bolus/intermittent or time-limited regimens are recorded under `excluded` with the
reason they are not added as ongoing lines. Original chapter orders remain intact.
