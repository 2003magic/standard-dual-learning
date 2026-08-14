---
name: learn-before-retry
description: >-
  Quick-load protocol for the moment a tool call just failed and you are tempted
  to retry it immediately: classify the failure, refresh knowledge (web_search,
  source, docs), revise the hypothesis, then verify with one decisive experiment
  instead of retrying variants.
---

# Learn Before Retry

Load this when a tool call just failed and you are about to retry it.

1. **Classify the failure.** Extract the fingerprint: error code, exit code,
   exception type, or status token. Has this exact class been seen before?
2. **Do not retry the same call with cosmetic variations.** A same-class failure
   is a knowledge gap, not bad luck — more attempts at the same hypothesis change
   nothing.
3. **Learn.** web_search the fingerprint plus current docs; read the tool's or
   library's real mechanism; find how open-source projects solved it.
4. **Revise the hypothesis.** Write one sentence: "it failed because X, and now
   I know Y, so Z should work."
5. **Verify once.** Run one decisive experiment. Record the lesson in
   `.dual-learning/lessons.md` before moving on.

Retry budgets: the preset's dual-learning plugin counts same-fingerprint streaks
(notice at 3) and repeat-tool-reminder catches identical calls (notice at 2, 4, 6).
Both are advisory — the decision to learn, change approach, or conclude is yours.
