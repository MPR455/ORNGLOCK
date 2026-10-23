# Clinical database Â· simple

Index and scraper for the 36 chapters of **é€Ÿçœ‹æŒ‡å¼•ï¼ˆå€¼ç­å†’éšªï¼‰** at
<https://med-study-rpg.com/oncall/pocket/>. These are the short pocket
versions of the chapters in [`../detailed`](../detailed).

> The chapter content is Â© WLK M.D. and has no open license, so this folder
> commits only the scraper and an index of titles and links. The downloaded
> articles go to `articles/`, which is git-ignored. Keep them on your own
> computer for personal study and do not commit or share them.
>
> The site notes that its content is AI-generated, for teaching only, not
> medical advice, and not reviewed line by line by a person.

## Usage

```bash
cd "clinical database/simple"
python scrape_simple.py          # all 36 chapters -> articles/NN-slug.md
python scrape_simple.py sodium   # just the chapters whose slug matches
```

Uses only the Python 3.9+ standard library and reuses the converter in
`../detailed/scrape_detailed.py`, so keep the two folders together. Each
article keeps its headings and bullet points, plus the `â†—` links back to the
matching section of the detailed chapter. Flowcharts become nested lists:
branch conditions are in *italics* and alerts are marked âš ï¸. Interactive
widgets such as score calculators are left out.

## Chapters

| # | Chapter | Local file |
|---|---------|------------|
| 01 | [·NÃÑ§ïÅÜ](https://med-study-rpg.com/oncall/pocket/altered-consciousness/) | `articles/01-altered-consciousness.md` |
| 02 | [Ä¼°Ê¡B§ğÀ»©Ê](https://med-study-rpg.com/oncall/pocket/agitation/) | `articles/02-agitation.md` |
| 03 | [Åöíw](https://med-study-rpg.com/oncall/pocket/seizure/) | `articles/03-seizure.md` |
| 04 | [ÀYµh](https://med-study-rpg.com/oncall/pocket/headache/) | `articles/04-headache.md` |
| 05 | [ÀY·w¡B©ü³Ö](https://med-study-rpg.com/oncall/pocket/dizziness-syncope/) | `articles/05-dizziness-syncope.md` |
| 06 | [¯İµh](https://med-study-rpg.com/oncall/pocket/chest-pain/) | `articles/06-chest-pain.md` |
| 07 | [³İ¡B©I§l§xÃø](https://med-study-rpg.com/oncall/pocket/dyspnea/) | `articles/07-dyspnea.md` |
| 08 | [¸¡µh](https://med-study-rpg.com/oncall/pocket/abdominal-pain/) | `articles/08-abdominal-pain.md` |
| 09 | [®ø¤Æ¹D¥X¦å](https://med-study-rpg.com/oncall/pocket/gi-bleeding/) | `articles/09-gi-bleeding.md` |
| 10 | [¿é²G](https://med-study-rpg.com/oncall/pocket/fluids/) | `articles/10-fluids.md` |
| 11 | [§¿¶q´î¤Ö](https://med-study-rpg.com/oncall/pocket/oliguria/) | `articles/11-oliguria.md` |
| 12 | [§¿¶q¼W¥[](https://med-study-rpg.com/oncall/pocket/polyuria/) | `articles/12-polyuria.md` |
| 13 | [¦å§¿](https://med-study-rpg.com/oncall/pocket/hematuria/) | `articles/13-hematuria.md` |
| 14 | [¥Ö¯l»P¹L±Ó¤ÏÀ³](https://med-study-rpg.com/oncall/pocket/rash-allergy/) | `articles/14-rash-allergy.md` |
| 15 | [¶Ë¤f](https://med-study-rpg.com/oncall/pocket/wounds/) | `articles/15-wounds.md` |
| 16 | [ªÏÅé¯kµh](https://med-study-rpg.com/oncall/pocket/limb-pain/) | `articles/16-limb-pain.md` |
| 17 | [µo¿N](https://med-study-rpg.com/oncall/pocket/fever/) | `articles/17-fever.md` |
| 18 | [°ª¦åÀ£](https://med-study-rpg.com/oncall/pocket/hypertension/) | `articles/18-hypertension.md` |
| 19 | [§C¦åÀ£¡B¥ğ§J](https://med-study-rpg.com/oncall/pocket/hypotension-shock/) | `articles/19-hypotension-shock.md` |
| 20 | [¤ß·i¹L³t](https://med-study-rpg.com/oncall/pocket/tachycardia/) | `articles/20-tachycardia.md` |
| 21 | [¤ß·i¹L½w](https://med-study-rpg.com/oncall/pocket/bradycardia/) | `articles/21-bradycardia.md` |
| 22 | [¤îµh](https://med-study-rpg.com/oncall/pocket/analgesia/) | `articles/22-analgesia.md` |
| 23 | [¤W©I§l¹D¯gª¬](https://med-study-rpg.com/oncall/pocket/uri-symptoms/) | `articles/23-uri-symptoms.md` |
| 24 | [®ø¤Æ¹D¯gª¬](https://med-study-rpg.com/oncall/pocket/gi-symptoms/) | `articles/24-gi-symptoms.md` |
| 25 | [ÂíÀR¦w¯vÃÄ](https://med-study-rpg.com/oncall/pocket/sedatives/) | `articles/25-sedatives.md` |
| 26 | [¿é¦å»P¨Öµo¯g](https://med-study-rpg.com/oncall/pocket/transfusion/) | `articles/26-transfusion.md` |
| 27 | [¦º¤`«Å§i¡BÁpµ¸¥æ¯Z](https://med-study-rpg.com/oncall/pocket/death-handoff/) | `articles/27-death-handoff.md` |
| 28 | [¦å¿}](https://med-study-rpg.com/oncall/pocket/glucose/) | `articles/28-glucose.md` |
| 29 | [³h¦å](https://med-study-rpg.com/oncall/pocket/anemia/) | `articles/29-anemia.md` |
| 30 | [¾®¦å¥\¯à²§±`](https://med-study-rpg.com/oncall/pocket/coagulopathy/) | `articles/30-coagulopathy.md` |
| 31 | [»ÄÆP](https://med-study-rpg.com/oncall/pocket/acid-base/) | `articles/31-acid-base.md` |
| 32 | [¶u](https://med-study-rpg.com/oncall/pocket/sodium/) | `articles/32-sodium.md` |
| 33 | [¹[](https://med-study-rpg.com/oncall/pocket/potassium/) | `articles/33-potassium.md` |
| 34 | [¶t](https://med-study-rpg.com/oncall/pocket/calcium/) | `articles/34-calcium.md` |
| 35 | [ÁC](https://med-study-rpg.com/oncall/pocket/phosphate/) | `articles/35-phosphate.md` |
| 36 | [Áâ](https://med-study-rpg.com/oncall/pocket/magnesium/) | `articles/36-magnesium.md` |
