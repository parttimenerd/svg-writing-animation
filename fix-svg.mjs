#!/usr/bin/env node
/**
 * fix-svg.mjs  <input.svg>  [output.svg]  [--verbose]
 *
 * Converts an Inkscape SVG into the format expected by the writing-animation
 * widget. The only thing you need to do in Inkscape is set inkscape:label on
 * each path:
 *
 *   Glyph paths (filled letter shapes):  text1, text2, …
 *   Stroke paths (pen trajectories):     clippath1, clippath2, …
 *
 * The script:
 *   - Extracts those paths from wherever they sit in the layer tree
 *   - Strips all Inkscape / sodipodi metadata from the <svg> element
 *   - Strips redundant / Inkscape-specific CSS from style attributes
 *   - Drops the style attribute entirely from glyph paths (they render filled by default)
 *   - Adds <clipPath> stencils to <defs>
 *   - Adds clip-path="url(#textClipN)" on each stroke path
 *   - Adds data-draw-color / data-durations to <svg> (defaults; edit after)
 *   - Emits a clean, minimal SVG
 *
 * Output defaults to <input>-fixed.svg next to the input file.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, basename, extname, join } from 'node:path';

// ── Args ──────────────────────────────────────────────────────────────────────

const rawArgs = process.argv.slice(2);
const verbose = rawArgs.includes('--verbose');
const args    = rawArgs.filter(a => !a.startsWith('--'));
const [inFile, outFile] = args;

if (!inFile) {
  console.error('Usage: node fix-svg.mjs <input.svg> [output.svg] [--verbose]');
  process.exit(1);
}

const src = readFileSync(inFile, 'utf8');

// ── Attribute parsing / serialisation ────────────────────────────────────────

function parseAttrs(str) {
  const attrs = {};
  const re = /([\w:.-]+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(str)) !== null) attrs[m[1]] = m[2];
  return attrs;
}

// ── Path extraction ───────────────────────────────────────────────────────────

function extractPaths(src) {
  const results = [];
  const re = /<path\b([\s\S]*?)\/>/g;
  let m;
  while ((m = re.exec(src)) !== null)
    results.push({ attrs: parseAttrs(m[1]) });
  return results;
}

// ── Style cleaning ────────────────────────────────────────────────────────────

// CSS properties that are Inkscape artefacts, redundant SVG defaults, or
// irrelevant to a static filled/stroked path.
const DROP_PROPS = new Set([
  // Inkscape text-object leftovers (these are on object-to-path glyphs)
  '-inkscape-font-specification', 'font-size', 'font-family',
  'line-height', 'text-align', 'text-anchor',
  // SVG presentation defaults — no effect, just noise
  'display', 'opacity',
  'stroke-opacity', 'fill-opacity',
  'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
]);

function cleanStyle(style) {
  return style
    .split(';')
    .map(s => s.trim())
    .filter(s => {
      if (!s) return false;
      const [prop, val] = s.split(':').map(p => p.trim());
      if (DROP_PROPS.has(prop)) return false;
      // stroke-dasharray / stroke-dashoffset set to "none" or "0" are placeholders
      if (prop === 'stroke-dasharray'  && (val === 'none' || val === '0')) return false;
      if (prop === 'stroke-dashoffset' && val === '0') return false;
      // stroke-width on a path that has no stroke is noise
      if (prop === 'stroke-width' && style.includes('fill') && !style.includes('stroke:#') && !style.includes('stroke:rgb')) return false;
      return true;
    })
    .join(';');
}

// ── Path classification ───────────────────────────────────────────────────────

function classify(attrs) {
  for (const v of [attrs['inkscape:label'], attrs['id']]) {
    if (!v) continue;
    if (/^clippath(\d+)$/i.test(v)) return { kind: 'stroke', n: +v.replace(/\D/g,'') };
    if (/^text(\d+)$/i.test(v))     return { kind: 'glyph',  n: +v.replace(/\D/g,'') };
  }
  return null;
}

const allPaths = extractPaths(src);
const strokes  = [];
const glyphs   = [];

for (const p of allPaths) {
  const c = classify(p.attrs);
  if (!c) {
    if (verbose) console.log(`  skip id="${p.attrs.id}" label="${p.attrs['inkscape:label']||''}"`);
    continue;
  }
  (c.kind === 'stroke' ? strokes : glyphs).push({ ...p, n: c.n });
}

strokes.sort((a,b) => a.n - b.n);
glyphs.sort( (a,b) => a.n - b.n);

if (!strokes.length) {
  console.error('No paths with inkscape:label="clippathN" found.');
  process.exit(1);
}

console.log(`strokes: ${strokes.map(p => 'clippath'+p.n).join(', ')}`);
console.log(`glyphs:  ${glyphs.map( p => 'text'+p.n ).join(', ')}`);

// ── Path serialisation ────────────────────────────────────────────────────────
// Attribute order: id, clip-path, style, d  — then d on its own line.

function renderPath(id, extraAttrs, style, d) {
  const lines = [`<path id="${id}"`];
  for (const [k,v] of Object.entries(extraAttrs)) lines.push(`      ${k}="${v}"`);
  if (style) lines.push(`      style="${style}"`);
  lines.push(`      d="${d}" />`);
  return lines.join('\n');
}

function buildGlyph(p) {
  // Glyphs are filled paths — their style after stripping Inkscape properties
  // is usually just stroke-width (from the text frame), which is meaningless.
  // Drop the style entirely; the browser default (black fill, no stroke) is correct.
  return renderPath('text'+p.n, {}, null, p.attrs.d);
}

function buildStroke(p) {
  const style = cleanStyle(p.attrs.style || '');
  return renderPath('clippath'+p.n, { 'clip-path': `url(#textClip${p.n})` }, style||null, p.attrs.d);
}

// ── Bounding box from path d= strings ────────────────────────────────────────
// Parses absolute coordinates from SVG path data to find the content bbox.
// Handles M/L/H/V/C/S/Q/T/A commands (both upper and lower case).

function pathBounds(d) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let x = 0, y = 0;
  function pt(px, py) {
    if (px < minX) minX = px; if (px > maxX) maxX = px;
    if (py < minY) minY = py; if (py > maxY) maxY = py;
  }
  // Tokenise: split on commands, keeping the command letter
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/g) || [];
  let cmd = 'M', i = 0;
  const num = () => parseFloat(tokens[i++]);
  while (i < tokens.length) {
    const t = tokens[i];
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(t)) { cmd = t; i++; continue; }
    if (cmd === 'M') { x = num(); y = num(); pt(x,y); cmd = 'L'; }
    else if (cmd === 'm') { x += num(); y += num(); pt(x,y); cmd = 'l'; }
    else if (cmd === 'L') { x = num(); y = num(); pt(x,y); }
    else if (cmd === 'l') { x += num(); y += num(); pt(x,y); }
    else if (cmd === 'H') { x = num(); pt(x,y); }
    else if (cmd === 'h') { x += num(); pt(x,y); }
    else if (cmd === 'V') { y = num(); pt(x,y); }
    else if (cmd === 'v') { y += num(); pt(x,y); }
    else if (cmd === 'C') { num();num();num();num(); x=num();y=num(); pt(x,y); }
    else if (cmd === 'c') { num();num();num();num(); x+=num();y+=num(); pt(x,y); }
    else if (cmd === 'S'||cmd==='Q') { num();num(); x=num();y=num(); pt(x,y); }
    else if (cmd === 's'||cmd==='q') { num();num(); x+=num();y+=num(); pt(x,y); }
    else if (cmd === 'T') { x=num();y=num(); pt(x,y); }
    else if (cmd === 't') { x+=num();y+=num(); pt(x,y); }
    else if (cmd === 'A') { num();num();num();num();num(); x=num();y=num(); pt(x,y); }
    else if (cmd === 'a') { num();num();num();num();num(); x+=num();y+=num(); pt(x,y); }
    else if (cmd === 'Z'||cmd==='z') { /* nothing */ }
    else i++; // unknown, skip token
  }
  return minX===Infinity ? null : { minX, minY, maxX, maxY };
}

function unionBounds(paths) {
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  for (const p of paths) {
    const b = pathBounds(p.attrs.d || '');
    if (!b) continue;
    if (b.minX<minX) minX=b.minX; if (b.minY<minY) minY=b.minY;
    if (b.maxX>maxX) maxX=b.maxX; if (b.maxY>maxY) maxY=b.maxY;
  }
  return minX===Infinity ? null : { minX, minY, maxX, maxY };
}

// ── SVG element ───────────────────────────────────────────────────────────────

const SVG_KEEP = ['xmlns','data-draw-color','data-durations'];

const rawSvg = parseAttrs((src.match(/<svg\b([\s\S]*?)>/) || ['',''])[1]);
const svgAttrs = {};
for (const k of SVG_KEEP) {
  if (rawSvg[k]) svgAttrs[k] = rawSvg[k];
}
if (!svgAttrs.xmlns)              svgAttrs.xmlns              = 'http://www.w3.org/2000/svg';
if (!svgAttrs['data-draw-color']) svgAttrs['data-draw-color'] = 'white';
if (!svgAttrs['data-durations'])  svgAttrs['data-durations']  = strokes.map(()=>700).join(',');

// Compute a tight viewBox from all content paths + padding
const PAD = 2;
const bounds = unionBounds(glyphs);
if (bounds) {
  const vx = (bounds.minX - PAD).toFixed(2);
  const vy = (bounds.minY - PAD).toFixed(2);
  const vw = (bounds.maxX - bounds.minX + PAD*2).toFixed(2);
  const vh = (bounds.maxY - bounds.minY + PAD*2).toFixed(2);
  svgAttrs.viewBox = `${vx} ${vy} ${vw} ${vh}`;
  console.log(`viewBox: ${svgAttrs.viewBox}`);
} else {
  // Fall back to original
  if (rawSvg.viewBox) svgAttrs.viewBox = rawSvg.viewBox;
}

const svgOpen = '<svg ' + Object.entries(svgAttrs).map(([k,v]) => `${k}="${v}"`).join('\n     ') + '>';

// ── Assemble ──────────────────────────────────────────────────────────────────

const indent = (s, n=4) => s.split('\n').map(l => ' '.repeat(n)+l).join('\n');

const clipDefs = strokes
  .map(p => `    <clipPath id="textClip${p.n}">\n      <use href="#text${p.n}" />\n    </clipPath>`)
  .join('\n');

const glyphLines  = glyphs .map(p => indent(buildGlyph(p))).join('\n');
const strokeLines = strokes.map(p => indent(buildStroke(p))).join('\n');

const output = `<?xml version="1.0" encoding="UTF-8"?>
${svgOpen}
  <defs>
${clipDefs}
  </defs>
  <g id="glyphs">
${glyphLines}
  </g>
  <g id="strokes">
${strokeLines}
  </g>
</svg>
`;

const dest = outFile || join(dirname(inFile), basename(inFile, extname(inFile)) + '-fixed.svg');
writeFileSync(dest, output, 'utf8');
console.log(`written: ${dest}`);
console.log(`\nReview and adjust:`);
console.log(`  data-durations="${svgAttrs['data-durations']}"  (ms per stroke)`);
console.log(`  data-draw-color="${svgAttrs['data-draw-color']}"  (must match your stroke color)`);
