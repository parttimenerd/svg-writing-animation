# SVG handwriting animation

An interactive demo comparing four approaches to animating handwritten SVG text:

1. **Clip-path wipe** - reveals text left-to-right using `clip-path: inset()`
2. **Raw stroke** - animates the pen trajectory via `stroke-dashoffset`; strokes escape the letter outlines
3. **Clipped stroke, simple path** - pen path traces the letters closely, clipped to the glyph shapes
4. **Clipped stroke, hand-drawn path** - pen path overshoots and loops naturally, clipped so ink stays inside the glyphs

I learned this technique while building a friend's wedding page.

Live demo: https://parttimenerd.github.io/svg-writing-animation/

---

## How it works

Each widget has a CSS and HTML panel you can open and edit live. Changing the CSS restarts the animation automatically.

The core trick for approaches 2-4:

```css
#clippath1 {
  animation: draw 0.7s linear 0s forwards;
}

@keyframes draw {
  to { stroke-dashoffset: 0; }
}
```

The SVG path already has `stroke-dasharray` and `stroke-dashoffset` set as inline styles by Inkscape. Animating `dashoffset` to 0 slides the dash into view - the line draws itself.

---

## Creating your own text

You need Inkscape.

### Approach 1 - Clip-path wipe

No SVG needed. Just put your text in a `<span class="wh-wipe-text">` and the widget handles the rest via CSS `clip-path: inset()`.

### Approaches 2-4 - Stroke animation

#### 1. Type your text

Use a script font for the most natural handwriting look (this demo uses [Hello Gorgeous](https://www.dafont.com/hello-gorgeous.font)), though any font works. Type your word as a text object, then convert it to a path: **Path > Object to Path**.

These filled glyph paths become the letter shapes (`#text1`, `#text2`, ...).

#### 2. Draw the pen trajectory

For each stroke, manually trace *how a pen would actually write* the letters using the Bezier tool - follow the natural writing order, without lifting the pen where possible.

For a natural hand-drawn feel, let the path overshoot slightly at stroke ends and loop through letters as a real pen would. For a cleaner look, trace the letter outlines more precisely.

The stroke path needs these style properties (set via the XML editor or Fill and Stroke dialog):

```
fill: none
stroke: #cd0000   (or any color - must match data-draw-color below)
```

Inkscape will automatically write `stroke-dasharray` and `stroke-dashoffset` when you apply a dashed stroke style to the path. Set the dash length equal to the path length (readable from the XML editor or via `getTotalLength()` in the browser console).

#### 3. Add the clipPath stencils (approaches 3 and 4 only)

In the XML editor, add inside `<defs>`:

```xml
<clipPath id="textClip1">
  <use href="#text1" />
</clipPath>
```

Then add `clip-path="url(#textClip1)"` to the stroke path. The ink will only show inside the letter outline.

#### 4. Configure the SVG element

Add these attributes to the `<svg>` element via the XML editor:

```
data-draw-color="white"
data-durations="500,300,800"
```

`data-draw-color` must match the stroke color you set on the pen paths - the JS scrubber uses this color when it takes over from the CSS animation.

`data-durations` is a comma-separated list of durations in ms, one per stroke path, controlling how long each stroke takes to draw.

#### 5. Export and build

Save as **Plain SVG**. Place the file at `svg/text.svg` (hand-drawn) or `svg/text-simple.svg` (simple path), then:

```
node build.mjs
```

This writes `index.html` (the standalone demo) and `wordpress-block.html` (a self-contained snippet you can paste into a WordPress HTML block, after uploading the font file to the Media Library).

---

## Running locally

Build first, then serve the root directory:

```
node build.mjs
python3 -m http.server 8080
```

Then open http://localhost:8080.

---

## License

MIT
