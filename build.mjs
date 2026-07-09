#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const src  = (p) => join(__dir, 'src', p);
const dist = (p) => join(__dir, p);

const css         = readFileSync(src('widget.css'), 'utf8');
const js          = readFileSync(src('widget.js'),  'utf8');
const svgHanddrawn = readFileSync(join(__dir, 'svg', 'text.svg'), 'utf8').trim();

// Adjust font path for root-level outputs
const cssRoot = css.replace(
  "url('../HelloGorgeous-Script.ttf')",
  "url('./HelloGorgeous-Script.ttf')"
);

const svgHanddrawnNoClip = svgHanddrawn.replace(/\s*clip-path="url\([^"]*\)"/g, '');

// ── Widget HTML builder ──────────────────────────────────────────────────────
// Controls are rendered by React at runtime - the div is just a mount point.

function widget({ title, subtitle, content }) {
  return `
<div class="wh-widget">
  <div class="wh-header">
    <p class="wh-title">${title}</p>
    <p class="wh-subtitle">${subtitle}</p>
  </div>
  <div class="wh-stage">
    ${content}
  </div>
  <div class="wh-mount"></div>
</div>`.trim();
}

const w1 = widget({
  title:    'Approach 1 - Simple wipe',
  subtitle: 'clip-path: inset(-50% X% -50% 0) - a horizontal reveal from left to right',
  content:  `<span class="wh-wipe-text">Let's party!</span>`,
});

const w2 = widget({
  title:    'Approach 2 - Stroke without clippath',
  subtitle: 'stroke-dashoffset animation on the raw pen trajectory - notice the strokes escape the letter outlines',
  content:  svgHanddrawnNoClip,
});

const w3 = widget({
  title:    'Approach 3 - Stroke with clippath',
  subtitle: 'Pen path overshoots and loops naturally - clipped so ink stays inside the glyphs',
  content:  svgHanddrawn,
});

const allWidgets = [w1, w2, w3].join('\n\n');

// ── CDN scripts ──────────────────────────────────────────────────────────────

const cdnScripts = `
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/htm@3/dist/htm.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/codemirror@5/lib/codemirror.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/codemirror@5/mode/css/css.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/codemirror@5/mode/xml/xml.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/codemirror@5/mode/htmlmixed/htmlmixed.js"></script>`.trim();

const cmCss = [
  'https://cdn.jsdelivr.net/npm/codemirror@5/lib/codemirror.css',
  'https://cdn.jsdelivr.net/npm/codemirror@5/theme/material-darker.css',
];

// ── index.html ───────────────────────────────────────────────────────────────

const indexHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SVG writing animation</title>
  ${cmCss.map(href => `<link rel="stylesheet" href="${href}">`).join('\n  ')}
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #060606;
      color: #fff;
      padding: 3rem 1rem;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .page-wrap {
      max-width: 700px;
      margin: 0 auto;
    }
    h1 {
      font-size: 1rem;
      font-weight: 400;
      color: #555;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      margin-bottom: 2rem;
    }
    ${cssRoot}
  </style>
</head>
<body>
  <div class="page-wrap">
    <h1>SVG writing animation</h1>
    ${allWidgets}
  </div>
  ${cdnScripts}
  <script>
${js}
  </script>
</body>
</html>`;

// ── wordpress-block.html ─────────────────────────────────────────────────────
// Font: upload HelloGorgeous-Script.ttf to WP Media Library and replace the URL.

const wpBlock = `<!-- Writing simulation widgets. Upload HelloGorgeous-Script.ttf to WP Media
     Library and replace ./HelloGorgeous-Script.ttf with the media URL. -->
${cmCss.map(href => `<link rel="stylesheet" href="${href}">`).join('\n')}
<style>
${cssRoot}
</style>

${allWidgets}

${cdnScripts}
<script>
${js}
</script>`;

// ── widget-N.html (standalone iframe-embeddable pages) ───────────────────────

function widgetPage(widgetHtml) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${cmCss.map(href => `<link rel="stylesheet" href="${href}">`).join('\n  ')}
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #060606; padding: 1rem; font-family: system-ui, -apple-system, sans-serif; }
    ${cssRoot}
  </style>
</head>
<body>
  ${widgetHtml}
  ${cdnScripts}
  <script>
${js}
  </script>
</body>
</html>`;
}

const w1page = widgetPage(w1);
const w2page = widgetPage(w2);
const w3page = widgetPage(w3);

writeFileSync(dist('index.html'),           indexHtml, 'utf8');
writeFileSync(dist('wordpress-block.html'), wpBlock,   'utf8');
writeFileSync(dist('widget-1.html'),        w1page,    'utf8');
writeFileSync(dist('widget-2.html'),        w2page,    'utf8');
writeFileSync(dist('widget-3.html'),        w3page,    'utf8');

console.log('Built:');
console.log('  index.html           (' + indexHtml.length + ' B)');
console.log('  wordpress-block.html (' + wpBlock.length   + ' B)');
console.log('  widget-1.html        (' + w1page.length    + ' B)');
console.log('  widget-2.html        (' + w2page.length    + ' B)');
console.log('  widget-3.html        (' + w3page.length    + ' B)');
