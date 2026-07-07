# SVG handwriting animation

An interactive demo comparing three approaches to animating handwritten SVG text:

1. **Clip-path wipe** — reveals text left-to-right using `clip-path: inset()`
2. **Raw stroke** — animates the pen trajectory via `stroke-dashoffset`, strokes escape the letter outlines
3. **Clipped stroke** — same technique, but the stroke is clipped to the filled glyph shapes so ink only shows inside the letters

I learned this technique while building a friend's wedding page.

Live demo: https://bcelary.github.io/svg-writing-animation/ *(replace with your GitHub Pages URL)*

---

## How it works

Each widget has a CSS and HTML panel you can open and edit live. Changing the CSS restarts the animation automatically.

The core trick for approaches 2 and 3:

```css
#clippath1 {
  animation: draw 0.7s linear 0s forwards;
}

@keyframes draw {
  to { stroke-dashoffset: 0; }
}
```

The SVG path already has `stroke-dasharray` and `stroke-dashoffset` set as inline styles by Inkscape. Animating `dashoffset` to 0 slides the dash into view — the line draws itself.

---

## Creating your own text

You need Inkscape.

### 1. Type your text

Use a script font (this demo uses [Hello Gorgeous](https://www.dafont.com/hello-gorgeous.font)). Type your word as a text object, then convert it to a path: **Path > Object to Path**.

These filled glyph paths become the letter shapes (`#text1`, `#text2`, …).

### 2. Draw the pen trajectory

For each stroke, manually trace *how a pen would actually write* the letters using the Bezier tool — follow the natural writing order, without lifting the pen where possible.

The stroke path needs these style properties (set via the XML editor):

```
fill: none
stroke: #cd0000        (or any color)
stroke-dasharray: N    (N = path length)
stroke-dashoffset: N
```

To get the path length: draw the path, then run `document.querySelector('#clippath1').getTotalLength()` in the browser console, or read it from Inkscape's XML editor after applying a dashed stroke.

### 3. Add the clipPath stencils (approach 3 only)

In the XML editor, add inside `<defs>`:

```xml
<clipPath id="textClip1">
  <use href="#text1" />
</clipPath>
```

Then add `clip-path="url(#textClip1)"` to the stroke path. The ink will only show inside the letter outline.

### 4. Configure the SVG element

Add these attributes to the `<svg>` element via the XML editor:

```
data-draw-color="white"
data-durations="700,4000"   (per-path durations in ms, comma-separated)
```

### 5. Export and build

Save as **Plain SVG**, replace `src/wir-heiraten.svg`, then:

```
node build.mjs
```

This writes `index.html` and `wordpress-block.html`.

---

## Running locally

No build step needed beyond `build.mjs`. Serve the root directory:

```
python3 -m http.server 8080
```

Then open http://localhost:8080.

---

## License

MIT
