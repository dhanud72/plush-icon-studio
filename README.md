# Plush Icon Studio 🧸

Procedural fluffy / felt / clay app-icon generator. One HTML file, zero dependencies, works offline.

**Live:** https://dhanud72.github.io/plush-icon-studio/

- Materials: fluffy fur, felt wool, soft clay
- Shapes: squircle, circle, pill
- Glyph from any letter/symbol/emoji or a pasted SVG path — flocked, stitched, or raised finish
- Seeded rendering (same seed = same icon), PNG export at 256 / 512 / 1024

The fur is painted procedurally on a canvas: a dense half-resolution under-layer upscaled for softness, a clumped flow field, a crisp top coat, and a short edge halo, finished with soft radial lighting.

## AI-drivable

This tool is scriptable — an AI agent (or you) can batch-produce icon sets and
phone-screen UI mockups from JSON recipes with `generate.ps1`. Point any agent
at **[AGENTS.md](AGENTS.md)** and say "use this tool"; it documents the spec
schema, the single-icon URL mode (`index.html?spec={...,"export":true}`), and
the UI-kit page (`ui-kit.html`).
