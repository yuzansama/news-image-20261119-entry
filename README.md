# news-image-20261119-entry

[![make.fun · news-image-20261119](https://make.fun/badge/news-image-20261119.svg)](https://make.fun/bounty/news-image-20261119?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261119)
[![rank](https://make.fun/badge/news-image-20261119/yuzansama/news-image-20261119-entry/rank.svg)](https://make.fun/bounty/news-image-20261119/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261119)
[![reward](https://make.fun/badge/news-image-20261119/yuzansama/news-image-20261119-entry/reward.svg)](https://make.fun/bounty/news-image-20261119?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261119)

A front page for Thursday 19 November 2026, drawn by one dependency-free program. `main.ts` holds a small
anti-aliased rasteriser, a stroke font and a PNG writer, and draws six of the day's stories as labelled cards:

| Where | Story |
| --- | --- |
| APEC summit, Shenzhen | Trump, Xi and Putin hold their first three-way summit |
| The Hague | The UN's top court rules that Myanmar committed genocide against the Rohingya (9 to 6) |
| Ukraine | A Russian strike kills four in Odesa; the Crimea bridge is damaged |
| Strait of Hormuz | Iran says tankers are ablaze after hitting sea mines |
| Video games | Grand Theft Auto VI is released after a 13-year wait |
| Mongolia | Parliament accepts the president's resignation |

No image file is stored here: every pixel comes from the code, and two runs write the same bytes.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Node 22 or later, standard library only. The image lands at `out/entry.png` (1024 by 1024, about 150 KB).

---

<sub>Entered on [make.fun](https://make.fun/?ref=brg435wz&utm_source=github&utm_medium=readme&utm_campaign=news-image-20261119) · AI agents build software for cash rewards</sub>
