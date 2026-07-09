# SVG handwriting animation

An interactive demo comparing three approaches to animating handwritten SVG text:

1. **Clip-path wipe** — reveals text left-to-right using `clip-path: inset()`
2. **Raw stroke** — animates the pen trajectory via `stroke-dashoffset`; strokes escape the letter outlines
3. **Clipped stroke** — pen path overshoots and loops naturally, clipped so ink stays inside the glyphs

I learned this technique while building a friend's wedding page.

Live demo: https://parttimenerd.github.io/svg-writing-animation/

---

## How it works

Each widget has a **CSS panel** you can open and edit live. Changing the CSS restarts the animation automatically. The HTML panel shows the corresponding SVG structure (read-only).

Widget 3 also has a **Raw stroke** toggle:
- **Raw stroke** (button active): removes the clip-path, showing the raw pen trajectory spilling outside the letter shapes — same visual as Widget 2
- **Clipped** (default): clip-path restored, ink stays inside the glyphs

The toggle works from any state — mid-animation, after scrubbing, or after Show result.

### Approach 1 — Clip-path wipe

A CSS `clip-path: inset()` on the text element is animated from fully hidden (`inset(-50% 100% -50% 0)`) to fully revealed (`inset(-50% 0% -50% 0)`). No SVG required.

```css
.wh-wipe-text {
  clip-path: inset(-50% 100% -50% 0);
  animation: wipe-reveal 2.8s linear forwards;
}

@keyframes wipe-reveal {
  to { clip-path: inset(-50% 0% -50% 0); }
}
```

### Approaches 2 & 3 — Stroke animation

The SVG paths have `stroke-dasharray` and `stroke-dashoffset` set to the full path length — making the stroke invisible. Animating `dashoffset` to `0` slides the stroke into view, drawing itself.

```css
#clippath1 {
  animation: draw 0.7s linear 0s forwards;
}

@keyframes draw {
  to { stroke-dashoffset: 0; }
}
```

Approach 3 adds a `<clipPath>` stencil per glyph. The pen path's `clip-path` attribute references the stencil, confining the ink to the letter shapes even when the pen trajectory overshoots.

```svg
<defs>
  <clipPath id="textClip1">
    <use href="#text1" />   <!-- borrows the filled glyph shape as a stencil -->
  </clipPath>
</defs>

<path id="clippath1" clip-path="url(#textClip1)"
      style="stroke-dasharray:325;stroke-dashoffset:325" d="…" />

<path id="text1" d="…" />   <!-- filled glyph; also doubles as the stencil shape -->
```

**Key constraint:** the stencil glyph (`#text1`) must remain a filled shape at all times. `fill:none`, `visibility:hidden`, and `display:none` all break the `<use>` reference inside `<clipPath>`. Use `opacity:0` instead to hide glyphs visually during animation.

---

## Creating your own text

You need Inkscape.

### Approach 1 — Clip-path wipe

No SVG needed. Put your text in a `<span class="wh-wipe-text">` and the widget handles the rest.

### Approaches 2 & 3 — Stroke animation

#### 1. Type your text

Use a script font for the most natural handwriting look (this demo uses [Hello Gorgeous](https://www.dafont.com/hello-gorgeous.font)). Type your word as a text object, then convert it to a path: **Path > Object to Path**.

These filled glyph paths become the letter shapes (`#text1`, `#text2`, …).

#### 2. Draw the pen trajectory

Create a new layer on top of the glyph layer (**Layer > Add Layer**). Draw the pen paths on this new layer so they stay separate from the letter shapes.

Split your word into segments — one path per stroke, roughly following how a pen lifts between letters. For each segment, trace *how a pen would actually write* the letters using the Bezier tool, following natural writing order without lifting the pen where possible.

For a natural hand-drawn feel, let the path overshoot slightly at stroke ends and loop through letters as a real pen would. The clip-path in Approach 3 will contain any overflow.

The stroke path needs these style properties (via the XML editor or Fill and Stroke dialog):

```
fill: none
stroke: #cd0000   (or any color — must match data-draw-color below)
```

#### 3. Label the paths

In the XML editor, set `inkscape:label` on each path:

- Glyph paths (filled letter shapes): `text1`, `text2`, …
- Stroke paths (pen trajectories): `clippath1`, `clippath2`, …

The numbers must match — `clippath1` is clipped to `text1`, and so on.

#### 4. Export and fix

Save as **Plain SVG** and place it at `svg/text.svg`. Then run:

```
node fix-svg.mjs svg/text.svg svg/text.svg
```

The script processes the file in-place (input and output can be the same path). It does the following:

- **Extracts** all `<path>` elements from the Inkscape layer tree
- **Classifies** them by `inkscape:label`: `textN` → glyph, `clippathN` → stroke path
- **Strips** Inkscape-specific attributes and metadata from the `<svg>` element
- **Cleans** stroke path styles (drops Inkscape artefacts, redundant SVG defaults)
- **Drops** the style attribute from glyph paths (browser default black fill is correct)
- **Adds `<clipPath>` stencils** to `<defs>` — each references its paired glyph via `<use href="#textN">`
- **Adds `clip-path="url(#textClipN)"`** on each stroke path
- **Computes a tight `viewBox`** from glyph bounding boxes only (stroke paths intentionally overshoot)
- **Defaults** `data-draw-color="white"` and `data-durations="700,700,…"` if not already set

Open the processed SVG and adjust two attributes on the root `<svg>` element:

- **`data-durations`**: comma-separated milliseconds per stroke path, in `clippath1, clippath2, …` order (default: 700ms each). The CSS panel in the demo shows the computed path lengths to help you tune these.
- **`data-draw-color`**: the stroke colour to use during animation — must match the stroke colour you used for the trajectory paths in Inkscape (default: `white`).

#### 5. Build

```
node build.mjs
```

This writes `index.html` (the standalone demo) and `wordpress-block.html` (a self-contained snippet for a WordPress HTML block — upload `HelloGorgeous-Script.ttf` to the Media Library and replace the font URL).

---

## Running locally

```
node build.mjs
python3 -m http.server 8080
```

Then open http://localhost:8080.

---

## Multiple widgets and CSS isolation

Each widget instance assigns a unique `id` to its SVG element (`wh-svg-1`, `wh-svg-2`, …) at initialisation. All generated CSS rules are scoped with this ID prefix:

```css
#wh-svg-1 #clippath1 { animation: draw 2s linear 0s forwards; }
#wh-svg-2 #clippath1 { animation: draw 2s linear 0s forwards; }
```

This prevents rules from one widget's CSS editor affecting another widget, even though both SVGs use the same element IDs internally.

---

## License

MIT
