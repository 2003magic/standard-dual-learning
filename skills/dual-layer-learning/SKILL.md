---
name: dual-layer-learning
description: >-
  Enforce dual-layer learning on coding tasks: refresh domain knowledge before
  writing code (Layer 1), and on repeated same-fingerprint failures pause to
  learn instead of mechanically retrying (Layer 2). Use for reverse engineering,
  flaky or anti-bot APIs, unfamiliar frameworks, and any task where model
  knowledge may be stale or recent attempts failed with the same signature.
---

# Dual-Layer Learning

## When to use

- The domain is new, fast-moving, or your training data may be stale
- You already failed at least twice with the same error signature (same code,
  exit code, exception type, or status token)
- The user says "先学习再试错" / "stop retrying and learn first"

## Protocol

### Layer 1 — Learn before you build

1. Read project guidance first: AGENTS.md / CLAUDE.md / .cursor/rules.
2. Refresh domain facts: web_search for current official docs and open-source
   implementations — do not trust model memory alone.
3. Write a short cognitive brief: constraints, likely pitfalls, 2-3 candidate
   approaches.
4. Start with the cheapest decisive experiment — one question, one answer.

### Layer 2 — Learn instead of retrying

Trigger: N consecutive failures with the same fingerprint (this preset's plugin
injects the notice automatically at N = 3).

1. **PAUSE** mechanical retries — a repeated same-class failure is a cognitive
   blind spot, not a parameter problem.
2. Name the assumption that is failing.
3. Research the real mechanism: read source/docs, find open-source solutions.
4. Revise the hypothesis.
5. Run **ONE** decisive validation experiment. Stop sweeping variants.

## Knowledge loop

- The preset's plugin writes failure events to `.dual-learning/events.jsonl`.
- After every learn-then-verify cycle, append a lesson to `.dual-learning/lessons.md`:

  `fingerprint | wrong assumption | what was learned | decisive experiment | result`

- Re-read recent lessons whenever a task touches a fingerprint you have seen
  before. Learning compounds; retries don't.
