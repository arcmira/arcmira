---
name: arcmira
description: Search what was said on YouTube and podcasts with Arcmira. Use when the user asks who said something, whether a show mentioned a company, person or product, a channel's sponsors, entity momentum, or a video's transcript.
---

<!-- Placeholder until the skill generated from the Arcmira client reference lands (arcmira/mcp plugins/arcmira). Refresh with: node scripts/sync-skill.mjs <path to SKILL.md> -->

# Arcmira

Arcmira indexes YouTube and podcast transcripts. It answers from the index, with watch links and dates.

Reach it through the `arcmira` MCP server (https://mcp.arcmira.com/mcp) or the `arcmira` command line (`npx arcmira --help`). Both take the same steps.

## Ids, not names

Filters take ids. Names go to resolve first.

1. Resolve every name: `arcmira resolve "Ramp"`, `arcmira resolve TBPN --type channel`. Entity ids look like `ent_14`; channel ids look like `UC` plus 22 characters.
2. Verify the row: check the type and the name. A name can match more than one thing (a company and a topic, two people). When resolve does not mark one row as suggested, pick by type and context, or ask the user.
3. Query with the ids: `arcmira mentions --entity ent_14 --channel UC-DRzaGnL_vtBUpCFH5M0tg --after 2026-09-01`.
4. Quote names beside ids in the answer, and link the watch URLs the results carry.

## Which call answers what

- Who said X, or where was X discussed: search (`arcmira search "agent payments" --after 2026-09-01`).
- Has show A mentioned B, first and last seen: mentions.
- Is B getting more airtime: momentum (one to four entities).
- Who sponsors show A: sponsors.
- Who recommends B, paid or not: recommendations (`--kind sponsored` or `organic`).
- What shows talk about, and what they share: occurrences.
- Newest episodes of a show: episodes.
- The words of one video: transcripts get (`arcmira transcript <url>`).
- What the index holds for a channel before you cite it: status.

## Quirks

- Dates are publish dates in UTC. State the date range you used in the answer. Do not guess today's date from result timestamps.
- An empty result means the index holds nothing for that filter, not that it was never said. Check `arcmira status <channel>` for coverage.
- Docs: https://arcmira.com/docs (append .md to any page for markdown), https://arcmira.com/llms.txt.
