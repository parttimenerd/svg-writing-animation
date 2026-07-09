#!/usr/bin/env node
// Builds widget-embed.js — a self-contained bundle for embedding widgets
// on any page without iframes.  Run via: node bundle.mjs
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { build } from 'esbuild';

const __dir = dirname(fileURLToPath(import.meta.url));
const src   = (p) => join(__dir, 'src', p);
const dist  = (p) => join(__dir, p);

// ── Reproduce the widget HTML strings (same logic as build.mjs) ─────────────

const svgHanddrawn = readFileSync(join(__dir, 'svg', 'text.svg'), 'utf8').trim();
const svgHanddrawnNoClip = svgHanddrawn.replace(/\s*clip-path="url\([^"]*\)"/g, '');

function widget({ title, subtitle, content }) {
  return `<div class="wh-widget">
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

// ── Build the filled entry file ──────────────────────────────────────────────
// embed-entry.js has two placeholders that are substituted before bundling:
//
//   __WIDGET_HTML_MAP__  → JSON literal: { '1': w1Html, '2': w2Html, '3': w3Html }
//   /* __WIDGET_JS__ */  → the raw widget.js IIFE, wrapped so we can capture
//                          its return value ({ initAll }) and use it to boot
//                          each widget after insertion.

const widgetMap = JSON.stringify({ '1': w1, '2': w2, '3': w3 }, null, 0);
const widgetJs  = readFileSync(src('widget.js'), 'utf8');

// Capture the IIFE's return value so initAll() is callable from embed-entry.
// widget.js already returns { initAll } — we just assign it.
const wrappedWidgetJs =
  'var __whModule = (function () {\n' +
  '  var __ret = ' + widgetJs.trimEnd() + ';\n' +
  '  return typeof __ret === "object" ? __ret : {};\n' +
  '})();';

let entry = readFileSync(src('embed-entry.js'), 'utf8');

entry = entry.replace(
  'var WIDGETS = __WIDGET_HTML_MAP__;',
  'var WIDGETS = ' + widgetMap + ';'
);

entry = entry.replace(
  '/* __WIDGET_JS__ */',
  wrappedWidgetJs
);

// The embed-entry dispatches 'wh:init' on each inserted element.
// widget.js doesn't listen for that — instead call initAll() which is
// idempotent (data-whInit guard prevents double-boot).
entry = entry.replace(
  "// Boot just this widget — mirror the Widget() call in widget.js.\n    widgetEl.dispatchEvent(new CustomEvent('wh:init', { bubbles: true }));",
  "// Boot just this widget via the captured initAll (data-whInit guard prevents double-boot).\n    if (__whModule && __whModule.initAll) { __whModule.initAll(); }"
);

// ── Write temp file, run esbuild, clean up ───────────────────────────────────

const tmpEntry = src('_embed-entry-generated.js');
writeFileSync(tmpEntry, entry, 'utf8');

try {
  await build({
    entryPoints: [tmpEntry],
    bundle:      true,
    minify:      true,
    format:      'iife',
    outfile:     dist('widget-embed.js'),
    loader:      { '.css': 'text', '.ttf': 'dataurl' },
    banner:      { js: '/* writing-widget embed — https://parttimenerd.github.io/svg-writing-animation/ */' },
  });
} finally {
  unlinkSync(tmpEntry);
}

const size = readFileSync(dist('widget-embed.js')).length;
console.log('Built: widget-embed.js (' + size + ' B, ' + (size / 1024).toFixed(1) + ' kB)');
