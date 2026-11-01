# Clinical database · DDx

Data behind the **differential diagnosis** tab (next to **order**). Tap an area on the
body figure (front or back), or search a symptom in Chinese or English, and the
right side lists the differential in categories, can't-miss diagnoses first.

Each symptom opens with a **first step** card: red flags, the physical exam to do,
assessment scores / questionnaires, and the order-tab conditions to open. Each
diagnosis shows its key clues; its **?** popup lists the extra physical exam and
the scores to fill, and every **order** button jumps straight to that condition in
the order tab.

Teaching summaries, not medical advice, and not reviewed line by line by a person.

## Layout

```
regions.json            body areas: id, name, en, icon. The figure itself is drawn
                        in ddx.mjs (VIEWS); skin and systemic are chips beside it
symptoms/NN-group.json  one file per body system, each a list of symptoms (edit these)
build-data.mjs          validates every file, checks every order link against the
                        order tab's chapters, then bundles them
ddx-data.mjs            generated module the site imports (do not edit)
```

## Symptom format

```json
{
  "id": "chest-pain", "name": "胸痛 / 胸悶", "en": "Chest pain",
  "regions": ["chest", "back"],
  "aliases": ["胸悶", "chest tightness", "angina"],
  "first": {
    "flags": ["red flags"], "pe": ["exam to do"], "scores": ["HEART score"],
    "orders": [["chest-pain", "胸痛：第一輪"]]
  },
  "groups": [
    { "title": "🚨 致命六大 · 不能漏", "tone": "urgent", "dx": [
      { "name": "主動脈剝離", "en": "Aortic dissection", "clues": "key features",
        "pe": ["exam in the ? popup"], "scores": ["ADD-RS"],
        "orders": [["chest-pain", "疑主動脈剝離"]] }
    ] }
  ]
}
```

- `regions`: where the symptom appears on the figure; the first one picks its home-screen section.
- `aliases`: extra search words in either language.
- `tone: "urgent"` draws the group in red.
- `orders`: `[chapter slug, condition name]` exactly as in `../JustDoIt/chapters/*.json`.
  The build fails if a link does not exist, so renaming an order condition shows every DDx link to fix.
- Every diagnosis needs `pe` or `scores`, so its `?` popup is never empty.

## After editing

```bash
node "clinical database/DDx/build-data.mjs"
npm test
```
