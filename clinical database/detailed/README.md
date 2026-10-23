# Clinical database · detailed

Index and scraper for the 36 chapters of **詳細指引（值班冒險）** at
<https://med-study-rpg.com/oncall/c/>.

> The chapter content is © WLK M.D. and has no open license, so this folder
> commits only the scraper and an index of titles and links. The downloaded
> articles go to `articles/`, which is git-ignored. Keep them on your own
> computer for personal study and do not commit or share them.
>
> The site notes that its content is AI-generated, for teaching only, not
> medical advice, and not reviewed line by line by a person.

## Usage

```bash
cd "clinical database/detailed"
python scrape_detailed.py          # all 36 chapters -> articles/NN-slug.md
python scrape_detailed.py sodium   # just the chapters whose slug matches
```

Uses only the Python 3.9+ standard library. The script waits 1.5 s between
requests. Each article keeps its headings, bullet points, source list, and
numbered citation links (`[[3](url)]`). Interactive widgets such as score
calculators are left out.

## Chapters

| # | Chapter | Local file |
|---|---------|------------|
| 01 | [意識改變](https://med-study-rpg.com/oncall/c/altered-consciousness/) | `articles/01-altered-consciousness.md` |
| 02 | [躁動、攻擊性](https://med-study-rpg.com/oncall/c/agitation/) | `articles/02-agitation.md` |
| 03 | [癲癇](https://med-study-rpg.com/oncall/c/seizure/) | `articles/03-seizure.md` |
| 04 | [頭痛](https://med-study-rpg.com/oncall/c/headache/) | `articles/04-headache.md` |
| 05 | [頭暈、昏厥](https://med-study-rpg.com/oncall/c/dizziness-syncope/) | `articles/05-dizziness-syncope.md` |
| 06 | [胸痛](https://med-study-rpg.com/oncall/c/chest-pain/) | `articles/06-chest-pain.md` |
| 07 | [喘、呼吸困難](https://med-study-rpg.com/oncall/c/dyspnea/) | `articles/07-dyspnea.md` |
| 08 | [腹痛](https://med-study-rpg.com/oncall/c/abdominal-pain/) | `articles/08-abdominal-pain.md` |
| 09 | [消化道出血](https://med-study-rpg.com/oncall/c/gi-bleeding/) | `articles/09-gi-bleeding.md` |
| 10 | [輸液](https://med-study-rpg.com/oncall/c/fluids/) | `articles/10-fluids.md` |
| 11 | [尿量減少](https://med-study-rpg.com/oncall/c/oliguria/) | `articles/11-oliguria.md` |
| 12 | [尿量增加](https://med-study-rpg.com/oncall/c/polyuria/) | `articles/12-polyuria.md` |
| 13 | [血尿](https://med-study-rpg.com/oncall/c/hematuria/) | `articles/13-hematuria.md` |
| 14 | [皮疹與過敏反應](https://med-study-rpg.com/oncall/c/rash-allergy/) | `articles/14-rash-allergy.md` |
| 15 | [傷口](https://med-study-rpg.com/oncall/c/wounds/) | `articles/15-wounds.md` |
| 16 | [肢體疼痛](https://med-study-rpg.com/oncall/c/limb-pain/) | `articles/16-limb-pain.md` |
| 17 | [發燒](https://med-study-rpg.com/oncall/c/fever/) | `articles/17-fever.md` |
| 18 | [高血壓](https://med-study-rpg.com/oncall/c/hypertension/) | `articles/18-hypertension.md` |
| 19 | [低血壓、休克](https://med-study-rpg.com/oncall/c/hypotension-shock/) | `articles/19-hypotension-shock.md` |
| 20 | [心搏過速](https://med-study-rpg.com/oncall/c/tachycardia/) | `articles/20-tachycardia.md` |
| 21 | [心搏過緩](https://med-study-rpg.com/oncall/c/bradycardia/) | `articles/21-bradycardia.md` |
| 22 | [止痛](https://med-study-rpg.com/oncall/c/analgesia/) | `articles/22-analgesia.md` |
| 23 | [上呼吸道症狀](https://med-study-rpg.com/oncall/c/uri-symptoms/) | `articles/23-uri-symptoms.md` |
| 24 | [消化道症狀](https://med-study-rpg.com/oncall/c/gi-symptoms/) | `articles/24-gi-symptoms.md` |
| 25 | [鎮靜安眠藥](https://med-study-rpg.com/oncall/c/sedatives/) | `articles/25-sedatives.md` |
| 26 | [輸血與併發症](https://med-study-rpg.com/oncall/c/transfusion/) | `articles/26-transfusion.md` |
| 27 | [死亡宣告、聯絡交班](https://med-study-rpg.com/oncall/c/death-handoff/) | `articles/27-death-handoff.md` |
| 28 | [血糖](https://med-study-rpg.com/oncall/c/glucose/) | `articles/28-glucose.md` |
| 29 | [貧血](https://med-study-rpg.com/oncall/c/anemia/) | `articles/29-anemia.md` |
| 30 | [凝血功能異常](https://med-study-rpg.com/oncall/c/coagulopathy/) | `articles/30-coagulopathy.md` |
| 31 | [酸鹼](https://med-study-rpg.com/oncall/c/acid-base/) | `articles/31-acid-base.md` |
| 32 | [鈉](https://med-study-rpg.com/oncall/c/sodium/) | `articles/32-sodium.md` |
| 33 | [鉀](https://med-study-rpg.com/oncall/c/potassium/) | `articles/33-potassium.md` |
| 34 | [鈣](https://med-study-rpg.com/oncall/c/calcium/) | `articles/34-calcium.md` |
| 35 | [磷](https://med-study-rpg.com/oncall/c/phosphate/) | `articles/35-phosphate.md` |
| 36 | [鎂](https://med-study-rpg.com/oncall/c/magnesium/) | `articles/36-magnesium.md` |
