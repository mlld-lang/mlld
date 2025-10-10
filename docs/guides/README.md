---
updated: 2025-10-10
tags: #docs
related-docs: docs/dev/DOCS.md
---

# Guide Aggregators

## tldr

Use this directory for mlld `.mld` guide files that stitch together excerpts from the canonical docs. Each guide should:
- Live under `docs/guides/`
- Use `/show <@devdocs/File.md # Section>` or `/show <@userdocs/...>` to pull authoritative content via the repo aliases
- Provide a short `Usage Notes` section explaining when to run it
- Reference the source doc sections explicitly so editors can keep the guide in sync

## Conventions

- File names: uppercase with hyphenated intent (`STRUCTURED-PIPELINE-DEBUG.mld`)
- Frontmatter: include `updated`, `tags`, and `related-docs`
- Guides must not contain unique prose that is not sourced elsewhere; instead point to the relevant doc sections
- Maintain a table of contents below with short descriptions

## Guides

- `STRUCTURED-PIPELINE-DEBUG.mld` — Aggregates StructuredValue/pipeline/shadow references for triaging #435-style issues
