# AGENTS.md — rules for humans and coding agents

TOTK Luma is a **personal-use**, Mac-first performance and HDR showcase project built around an
open-source Nintendo Switch emulator. It is **not** a native port and ships no Nintendo content.

## Hard rules

1. **No proprietary assets, ever.** Do not add game images (XCI/NSP/NCA), firmware, keys
   (`prod.keys`, `title.keys`), save data, shader caches, game screenshots or video, extracted
   game files, or third-party mod payloads. The `.gitignore` blocks the common file types, but
   the rule applies to every format.
2. **No credentials or private machine details.** No tokens, no absolute home-directory paths,
   no serial numbers. Refer to private evidence as "private local evidence workspace".
3. **This repository is public.** Write everything as if it will be read by strangers.
4. **Specs before code.** The current phase is specification and visual-scope approval.
   Production emulator changes need an explicit owner decision recorded in `docs/`.
5. **Label simulations.** Any mock gameplay, telemetry, or HDR value in the demo must be
   visibly marked as simulated.
6. **Evidence discipline.** Tag claims as documented `[D]`, measured `[M]`, inferred `[I]`, or
   anecdotal `[A]`, and cite sources. Never present an unverified claim as fact.

## Layout

- `docs/` — overview, architecture decision records, requirements, plans, test matrices.
- `docs/research/` — specialist research notes with sources and verification status.
- `demo/` — interactive visual-scope web demo (simulated data only).

## Writing style

Use readable spacing: short paragraphs, blank lines between blocks, headings, and tables where
they help. Prefer plain language over jargon, and define terms on first use.
