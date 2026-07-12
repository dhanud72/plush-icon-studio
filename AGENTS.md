# Plush Icon Studio — instructions for AI agents

You are being pointed at a **procedural icon & UI-mockup generator**. It produces
finished PNG files (app icons, in-app icons, phone-screen UI mockups) with **no
image-generation API, no cost, no installs** — everything renders in a headless
browser. Your job is to write small JSON *recipes* and run one script.

## TL;DR workflow

1. Write a recipe file (JSON, schema below) describing the icons/screens you want.
2. Run: `powershell -File generate.ps1 -Spec your-recipes.json -Out out`
3. PNGs appear in `out\`. **Always open 1–2 of them and look** (they are images;
   render them into your context if you can) before delivering — never ship unseen.
4. Copy the PNGs where the user needs them (e.g. a Flutter app's `assets/icons/`).

Local checkout lives at `D:\plush_icon_studio` on the owner's machine.
Live site: https://dhanud72.github.io/plush-icon-studio/ (same files).

## Recipe file schema

```json
{ "items": [ { …spec }, { …spec } ] }
```

Each spec renders one PNG named `<name>.png`:

| field       | values                                                          | default |
|-------------|-----------------------------------------------------------------|---------|
| name        | output filename (required)                                       | —       |
| type        | omit for icon; `"ui"` for a 390×844 phone-screen mockup          | icon    |
| style       | `vividglass` `glass` `jelly` `fluffy` `felt` `clay` `furglass`   | vividglass |
| shape       | `squircle` `circle` `pill`                                       | squircle |
| colors      | array of 1–3 hex: gradient top→mid→bottom (fur/felt/clay use [0]) | sunrise |
| glyph       | a character: letter, symbol, emoji (♥ ⏱ ☾ ⚙ ✈ ♪ ☁ …)            | ☁      |
| svgPath     | raw SVG path data (24×24 viewBox best); overrides glyph          | —       |
| glyphStyle  | `frosted` `flocked` `stitched` `raised`                          | frosted |
| glyphColor  | hex                                                              | #ffffff |
| glyphScale  | 25–75 (% of body)                                                | 46      |
| bg          | `transparent` `solid` `bokeh` `aurora`                           | solid   |
| bgColor     | hex (drives bokeh/aurora hues too)                               | #cfcbe0 |
| furLen      | 6–26 (fur styles)                                                | 14      |
| density     | 0.4–1.6 (fur styles)                                             | 1.0     |
| seed        | integer; same seed = identical render                            | 72      |
| size        | icon PNG size in px (256/512/1024)                               | 512     |

UI mockups (`"type":"ui"`) also accept: `appName`, `song`, `clock`, `date`,
`appGlyphs` (array of 4 glyph chars), `artGlyph`.

## Style guidance (what looks good)

- **vividglass**: 3 saturated colors, `frosted` white glyph, `aurora` or `solid` bg. The showpiece.
- **felt / fluffy**: 1 muted color + darker/lighter glyph, `flocked` or `stitched`. Cozy apps.
- **clay**: ivory body + near-black `raised` glyph. Minimal/sporty.
- **jelly**: 1–3 candy colors, `raised` glyph. Playful.
- Play Store app icons need a non-transparent bg at 512; in-app icons use `"bg":"transparent"`.
- Glyphs must be characters with a monochrome text form (Segoe UI Symbol). Test anything exotic.
- Keep one `colors`+`style` combo per app ("brand recipe") so every icon matches.

## Rendering a single icon without the script

Open (or headless-screenshot) this URL — the page becomes a bare canvas of
exactly `size` px, so a screenshot at `--window-size=size,size` is the PNG:

```
index.html?spec=<url-encoded JSON with "export":true>
msedge --headless=new --disable-gpu --window-size=512,512 --virtual-time-budget=9000 --screenshot=out.png "file:///D:/plush_icon_studio/index.html?spec=..."
```

## Architecture (if you need to modify)

- `index.html` — the whole interactive app, self-contained. The render engine sits
  between `/*ENGINE-START*/` and `/*ENGINE-END*/` markers and is **spec-driven**
  (pure functions of a spec object — no UI references allowed inside).
- `engine.js` — auto-extracted from those markers by `generate.ps1`; never edit by
  hand, edit index.html and re-run the script.
- `ui-kit.html` — phone-mockup page; loads engine.js, builds a control-center
  screen from the same spec.
- Adding a new material = new `render<X>Body()` in the engine + a button in the
  Material seg + a routing branch in `renderIcon`. Verify visually with a headless
  screenshot before shipping — fur-engine changes are impossible to judge blind.
