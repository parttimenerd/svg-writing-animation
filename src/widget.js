/**
 * WritingWidget - auto-detecting animation component powered by React.
 *
 * Place a .wh-widget element on the page. Multiple instances are independent.
 *
 * SVG auto-detection (reads the inline SVG inside .wh-widget):
 *
 *   Mode "wipe"
 *     The widget contains a .wh-wipe-text span.
 *     Reveals text left-to-right via clip-path: inset(-50% X% -50% 0).
 *
 *   Mode "stroke-only"
 *     SVG has paths with id="clippathN" but NO clip-path attributes on them.
 *     Stroke paths are animated raw - pen trajectory escapes the letter outlines.
 *
 *   Mode "stroke-clipped"  (chril.in technique)
 *     SVG paths with id="clippathN" have clip-path attributes referencing
 *     <clipPath> elements that wrap the #textN glyph shapes.
 *     "Show raw stroke" toggles the clip-path on/off.
 *
 * SVG data attributes:
 *   data-durations="700,4000"   Per-path durations in ms, id order (1, 2, …)
 *   data-draw-color="white"     Stroke colour used during animation
 */
(function () {
  if (window.__whLoaded) return;
  window.__whLoaded = true;

  var htm      = window.htm;
  var React    = window.React;
  var ReactDOM = window.ReactDOM;
  var html     = htm.bind(React.createElement);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  var whInstanceCounter = 0;

  function ensureKeyframes() {
    if (document.getElementById('wh-keyframes')) return;
    var s = document.createElement('style');
    s.id = 'wh-keyframes';
    s.textContent = '@keyframes wh-dash{to{stroke-dashoffset:0}}';
    document.head.appendChild(s);
  }

  function sortedByNumber(nodes, prefix) {
    return Array.from(nodes).sort(function (a, b) {
      var na = parseInt(a.id.replace(prefix, ''), 10);
      var nb = parseInt(b.id.replace(prefix, ''), 10);
      return na - nb;
    });
  }

  function detectMode(root) {
    if (root.querySelector('.wh-wipe-text')) return 'wipe';
    var svg = root.querySelector('svg');
    if (!svg) return null;
    var strokePaths = svg.querySelectorAll('[id^="clippath"]');
    if (!strokePaths.length) return null;
    var hasActiveClip = Array.from(strokePaths).some(function (p) {
      return !!p.getAttribute('clip-path');
    });
    return hasActiveClip ? 'stroke-clipped' : 'stroke-only';
  }

  // ── WipeAnimation ────────────────────────────────────────────────────────────

  function WipeAnimation(root) {
    this.text     = root.querySelector('.wh-wipe-text');
    this.duration = 2800;
  }

  WipeAnimation.prototype.reset = function () {
    this.text.style.animation = 'none';
    this.text.style.transition = 'none';
    this._apply(0);
  };

  WipeAnimation.prototype._apply = function (t) {
    var v = 'inset(-50% ' + ((1 - t) * 100) + '% -50% 0)';
    this.text.style.clipPath = v;
    this.text.style.webkitClipPath = v;
  };

  WipeAnimation.prototype.setProgress = function (t) { this._apply(t); };
  WipeAnimation.prototype.showResult  = function ()  { this._apply(1); };
  WipeAnimation.prototype.getDuration = function ()  { return this.duration; };

  WipeAnimation.prototype.getHtmlSnippet = function () {
    return '<span class="wh-wipe-text">Let\'s party!</span>';
  };

  WipeAnimation.prototype.getCssSnippet = function () {
    var dur = (this.duration / 1000).toFixed(1) + 's';
    return [
      '/* clip-path: inset(top right bottom left)',
      ' * Shrinking the right inset from 100% → 0% sweeps a',
      ' * reveal window across the text, left to right.',
      ' * Negative top/bottom (-50%) prevent the clip from cutting',
      ' * off ascenders (letters like "h", "l") and descenders ("y", "p").',
      ' * mdn clip-path:  https://developer.mozilla.org/en-US/docs/Web/CSS/clip-path',
      ' * mdn animation:  https://developer.mozilla.org/en-US/docs/Web/CSS/animation',
      ' * mdn @keyframes: https://developer.mozilla.org/en-US/docs/Web/CSS/@keyframes */',
      '.wh-wipe-text {',
      '  animation: wipe-reveal ' + dur + ' linear forwards;',
      '}',
      '',
      '@keyframes wipe-reveal {',
      '  from { clip-path: inset(-50% 100% -50% 0); } /* right=100%: fully hidden */',
      '  to   { clip-path: inset(-50%   0% -50% 0); } /* right=  0%: fully revealed */',
      '}',
    ].join('\n');
  };

  // ── StrokeAnimation (base) ───────────────────────────────────────────────────

  function StrokeAnimation(root) {
    this.svg = root.querySelector('svg');
    // Give this SVG a unique ID so injected CSS rules can be scoped to it,
    // avoiding collisions when multiple widgets share the same element IDs.
    if (!this.svg.id) {
      this.svg.id = 'wh-svg-' + (++whInstanceCounter);
    }
    this.svgId = this.svg.id;
    this.drawColor = this.svg.getAttribute('data-draw-color') || 'white';
    var rawDur = this.svg.getAttribute('data-durations') || '700,4000';
    this.durations = rawDur.split(',').map(Number);
    this.total = this.durations.reduce(function (a, b) { return a + b; }, 0);

    this.strokes = sortedByNumber(
      this.svg.querySelectorAll('[id^="clippath"]'), 'clippath'
    ).map(function (el) {
      return { el: el, len: el.getTotalLength ? el.getTotalLength() : 0 };
    });

    var accMs = 0;
    var self = this;
    this.strokes.forEach(function (seg, i) {
      var dur = self.durations[i] !== undefined
        ? self.durations[i]
        : self.durations[self.durations.length - 1];
      seg.dur       = dur;
      seg.startFrac = accMs / self.total;
      seg.endFrac   = (accMs + dur) / self.total;
      seg.delayMs   = accMs;
      accMs += dur;
    });

    this.glyphs = sortedByNumber(
      this.svg.querySelectorAll('path[id^="text"]'), 'text'
    ).map(function (el) {
      return { el: el, originalStyle: el.getAttribute('style') || '' };
    });

    ensureKeyframes();
  }

  StrokeAnimation.prototype.getDuration = function () { return this.total; };

  StrokeAnimation.prototype._setStrokeProgress = function (t) {
    this.strokes.forEach(function (seg) {
      var local;
      if      (t <= seg.startFrac) local = 0;
      else if (t >= seg.endFrac)   local = 1;
      else local = (t - seg.startFrac) / (seg.endFrac - seg.startFrac);
      seg.el.style.strokeDasharray  = seg.len;
      seg.el.style.strokeDashoffset = seg.len * (1 - local);
    });
  };

  StrokeAnimation.prototype._prepareStrokes = function () {
    var self = this;
    this.strokes.forEach(function (seg) {
      seg.el.style.display   = '';
      seg.el.style.setProperty('stroke',  self.drawColor, 'important');
      seg.el.style.setProperty('fill',    'none',         'important');
      seg.el.style.setProperty('opacity', '1',            'important');
    });
  };

  StrokeAnimation.prototype._hideGlyphs = function () {
    this.glyphs.forEach(function (g) {
      // Keep fill set (clipPath stencil needs it) but hide visually with opacity.
      // visibility:hidden and display:none break the <use href="#textN"> stencil reference.
      g.el.style.removeProperty('visibility');
      g.el.style.removeProperty('display');
      g.el.style.setProperty('opacity', '0', 'important');
    });
  };

  StrokeAnimation.prototype._showGlyphs = function () {
    this.strokes.forEach(function (seg) { seg.el.style.display = 'none'; });
    this.glyphs.forEach(function (g) {
      g.el.style.removeProperty('opacity');
      g.el.setAttribute('style', g.originalStyle);
    });
  };

  // Shared CSS header comment explaining the dasharray/dashoffset technique.
  // Used by both StrokeOnly and StrokeClipped snippets.
  StrokeAnimation.prototype._dashComment = function () {
    var lens = this.strokes.map(function (s) { return Math.round(s.len); });
    // dasharray=N makes one dash the full path length; dashoffset=N hides it.
    // Animating dashoffset → 0 slides the dash into view: the line draws itself.
    // mdn: https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-dashoffset
    return [
      '/* stroke-dashoffset animation - the self-drawing trick',
      ' * dasharray=N  one dash covering the full path length',
      ' * dashoffset=N shifts it off-screen (invisible)',
      ' * animate to 0 → slides back into view',
      ' * mdn: https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-dashoffset',
      ' *',
      ' * Path lengths: ' + lens.map(function(l, i){ return '#clippath'+(i+1)+'='+l; }).join(', ') + ' */',
    ].join('\n');
  };

  // ── StrokeOnlyAnimation ──────────────────────────────────────────────────────

  function StrokeOnlyAnimation(root) {
    StrokeAnimation.call(this, root);
  }
  StrokeOnlyAnimation.prototype = Object.create(StrokeAnimation.prototype);

  StrokeOnlyAnimation.prototype.reset = function () {
    this._prepareStrokes();
    this._hideGlyphs();
    this._setStrokeProgress(0);
  };

  StrokeOnlyAnimation.prototype.setProgress = function (t) {
    this._setStrokeProgress(t);
  };

  StrokeOnlyAnimation.prototype.showResult = function () {
    this._setStrokeProgress(1);
  };

  StrokeOnlyAnimation.prototype.getHtmlSnippet = function () {
    var lines = [
      '<svg data-draw-color="white" …>',
      '  <!--',
      '    stroke-dasharray and stroke-dashoffset are written by Inkscape.',
      '    The CSS animation only needs to animate dashoffset to 0.',
      '  -->',
    ];
    this.strokes.forEach(function (seg, i) {
      var n   = i + 1;
      var len = Math.round(seg.len);
      lines.push(
        '  <path id="clippath' + n + '"',
        '        style="stroke-dasharray:' + len + ';stroke-dashoffset:' + len + '"',
        '        d="…" />'
      );
    });
    lines.push('</svg>');
    return lines.join('\n');
  };

  StrokeOnlyAnimation.prototype.getCssSnippet = function () {
    var scope = '#' + this.svgId + ' ';
    var lens  = this.strokes.map(function (s) { return Math.round(s.len); });
    var lines = [
      '/* stroke-dasharray / stroke-dashoffset — the self-drawing trick',
      ' * dasharray: N   — one dash exactly as long as the path (covers it entirely)',
      ' * dashoffset: N  — shifts that dash off-screen so the stroke is invisible',
      ' * Animating dashoffset → 0 slides the dash back in, drawing the path.',
      ' * mdn stroke-dashoffset: https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-dashoffset',
      ' * mdn animation:         https://developer.mozilla.org/en-US/docs/Web/CSS/animation',
      ' * mdn @keyframes:        https://developer.mozilla.org/en-US/docs/Web/CSS/@keyframes',
      ' *',
      ' * Path lengths (px): ' + lens.map(function (l, i) { return '#clippath' + (i + 1) + ' = ' + l; }).join(', ') + ' */',
      '',
    ];
    this.strokes.forEach(function (seg, i) {
      var dur = (seg.dur / 1000).toFixed(2).replace(/\.?0+$/, '') + 's';
      var del = seg.delayMs > 0
        ? (seg.delayMs / 1000).toFixed(2).replace(/\.?0+$/, '') + 's'
        : '0s';
      lines.push(
        scope + '#clippath' + (i + 1) + ' {',
        '  animation: draw ' + dur + ' linear ' + del + ' forwards;',
        '}',
        ''
      );
    });
    lines.push(
      '@keyframes draw {',
      '  to { stroke-dashoffset: 0; }',
      '}'
    );
    return lines.join('\n');
  };

  // ── StrokeClippedAnimation ───────────────────────────────────────────────────

  function StrokeClippedAnimation(root) {
    StrokeAnimation.call(this, root);
    this.clippathShowing = true;
    var self = this;
    this.strokes.forEach(function (seg) {
      seg.originalClipPath = seg.el.getAttribute('clip-path') || '';
    });
  }
  StrokeClippedAnimation.prototype = Object.create(StrokeAnimation.prototype);

  StrokeClippedAnimation.prototype.reset = function () {
    this.clippathShowing = true;
    this._prepareStrokes();
    this._hideGlyphs();
    var self = this;
    this.strokes.forEach(function (seg) {
      if (seg.originalClipPath) seg.el.setAttribute('clip-path', seg.originalClipPath);
    });
    this._setStrokeProgress(0);
  };

  StrokeClippedAnimation.prototype.setProgress = function (t) {
    this._setStrokeProgress(t);
  };

  StrokeClippedAnimation.prototype.showResult = function () {
    this._showGlyphs();
  };

  StrokeClippedAnimation.prototype.toggleClippath = function () {
    this.clippathShowing = !this.clippathShowing;
    var self = this;
    if (self.clippathShowing) {
      // Back to clipped: restore clip-path, hide glyphs (opacity 0 keeps clipPath stencil intact).
      this.strokes.forEach(function (seg) {
        if (seg.originalClipPath) seg.el.setAttribute('clip-path', seg.originalClipPath);
        seg.el.style.setProperty('opacity', '1', 'important');
        seg.el.style.display = '';
        seg.el.style.strokeDashoffset = '0';
      });
      this.glyphs.forEach(function (g) {
        g.el.style.removeProperty('fill');
        g.el.style.removeProperty('stroke');
        g.el.style.removeProperty('visibility');
        g.el.style.setProperty('opacity', '0', 'important');
      });
    } else {
      // Raw stroke: remove clip-path so strokes overshoot the glyphs; show glyphs at low opacity as a ghost.
      this.strokes.forEach(function (seg) {
        seg.el.removeAttribute('clip-path');
        seg.el.style.setProperty('opacity', '1', 'important');
        seg.el.style.display = '';
        // Ensure stroke is fully drawn (dashoffset=0) regardless of prior state.
        seg.el.style.strokeDashoffset = '0';
      });
      this.glyphs.forEach(function (g) {
        g.el.style.removeProperty('visibility');
        g.el.style.setProperty('fill',    'currentColor', 'important');
        g.el.style.setProperty('stroke',  'none',         'important');
        g.el.style.setProperty('opacity', '0.25',         'important');
      });
    }
    return this.clippathShowing;
  };

  StrokeClippedAnimation.prototype.getHtmlSnippet = function () {
    var lines = [
      '<svg data-draw-color="white" …>',
      '  <defs>',
      '    <!--',
      '      clipPath = stencil: ink is only visible where the stencil shape is filled.',
      '      Each stencil borrows a filled glyph path (defined below) via <use>.',
      '    -->',
    ];
    this.strokes.forEach(function (seg, i) {
      var n = i + 1;
      lines.push(
        '    <clipPath id="textClip' + n + '">',
        '      <use href="#text' + n + '" />',
        '    </clipPath>'
      );
    });
    lines.push('  </defs>', '');
    lines.push(
      '  <!--',
      '    Pen trajectories - each clipped to its glyph stencil above.',
      '    stroke-dasharray and stroke-dashoffset are written by Inkscape.',
      '    The CSS animation only needs to animate dashoffset to 0.',
      '  -->'
    );
    this.strokes.forEach(function (seg, i) {
      var n   = i + 1;
      var len = Math.round(seg.len);
      lines.push(
        '  <path id="clippath' + n + '" clip-path="url(#textClip' + n + ')"',
        '        style="stroke-dasharray:' + len + ';stroke-dashoffset:' + len + '"',
        '        d="…" />'
      );
    });
    lines.push('');
    lines.push(
      '  <!-- Filled glyph outlines - serve as stencil shapes AND as the end result. -->'
    );
    this.strokes.forEach(function (seg, i) {
      var n = i + 1;
      lines.push('  <path id="text' + n + '" d="…" />');
    });
    lines.push('</svg>');
    return lines.join('\n');
  };

  StrokeClippedAnimation.prototype.getCssSnippet = function () {
    var scope = '#' + this.svgId + ' ';
    var lens  = this.strokes.map(function (s) { return Math.round(s.len); });
    var lines = [
      '/* stroke-dasharray / stroke-dashoffset — the self-drawing trick',
      ' * dasharray: N   — one dash exactly as long as the path (covers it entirely)',
      ' * dashoffset: N  — shifts that dash off-screen so the stroke is invisible',
      ' * Animating dashoffset → 0 slides the dash back in, drawing the path.',
      ' * mdn: https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-dashoffset',
      ' *',
      ' * The clip-path on each stroke path (set as an HTML attribute) confines',
      ' * the ink to its glyph stencil — so overshooting loops stay invisible.',
      ' *',
      ' * Path lengths (px): ' + lens.map(function (l, i) { return '#clippath' + (i + 1) + ' = ' + l; }).join(', ') + ' */',
      '',
    ];
    this.strokes.forEach(function (seg, i) {
      var dur = (seg.dur / 1000).toFixed(2).replace(/\.?0+$/, '') + 's';
      var del = seg.delayMs > 0
        ? (seg.delayMs / 1000).toFixed(2).replace(/\.?0+$/, '') + 's'
        : '0s';
      lines.push(
        scope + '#clippath' + (i + 1) + ' {',
        '  animation: draw ' + dur + ' linear ' + del + ' forwards;',
        '}',
        ''
      );
    });
    lines.push(
      '@keyframes draw {',
      '  to { stroke-dashoffset: 0; }',
      '}'
    );
    return lines.join('\n');
  };

  // ── CodeBlock (React component) ──────────────────────────────────────────────
  // Shared CodeMirror editor used for both CSS and HTML panels.
  // `mode` is a CodeMirror mode string ('css' or 'htmlmixed').

  var codeBlockCounter = 0;

  function CodeBlock({ snippet, mode, anim }) {
    var useEffect = React.useEffect;
    var useRef    = React.useRef;

    var styleId = useRef('wh-live-' + (++codeBlockCounter)).current;
    var elRef   = useRef(null);

    useEffect(function () {
      if (!window.CodeMirror || !elRef.current) return;

      var cm = CodeMirror(elRef.current, {
        value:          snippet,
        mode:           mode,
        theme:          'material-darker',
        lineNumbers:    false,
        lineWrapping:   false,
        indentUnit:     2,
        tabSize:        2,
        autofocus:      false,
        scrollbarStyle: 'null',
        readOnly:       mode !== 'css',
      });

      function fitHeight() {
        // Set the CM wrapper to exactly its content height so nothing clips.
        cm.setSize(null, cm.doc.height + 42); // 42 ≈ top+bottom padding (1.25rem × 2)
      }
      fitHeight();

      // Re-fit when the <details> opens; hand back control when it closes.
      var details = elRef.current.closest('details');
      function onToggle() {
        if (details.open) {
          cm.refresh();
          fitHeight();
          if (mode === 'css' && anim) {
            anim._triggerCssPlay = triggerCssPlay;
            if (!document.getElementById(styleId)) {
              var tag2 = document.createElement('style');
              tag2.id = styleId;
              tag2.textContent = cm.getValue();
              document.head.appendChild(tag2);
            }
            triggerCssPlay();
          }
        } else {
          if (mode === 'css' && anim) {
            anim._triggerCssPlay = null;
            if (anim.reset) anim.reset();
          }
          var t = document.getElementById(styleId);
          if (t) t.remove();
        }
      }
      if (details) details.addEventListener('toggle', onToggle);

      var playGen = 0;

      function stripAnimationFromStyle(el) {
        var s = el.getAttribute('style') || '';
        // Remove 'animation: ...' and all its sub-properties from the inline style string.
        // removeProperty() doesn't reliably remove the animation shorthand when it was
        // set via el.style.animation = 'none' (serializes as a multi-part shorthand).
        var cleaned = s
          .replace(/\s*animation(-[a-z-]+)?:[^;]+;?/g, '')
          .trim();
        el.setAttribute('style', cleaned);
      }

      function triggerCssPlay() {
        if (!anim) return;
        playGen++;
        var gen = playGen;
        var tag = document.getElementById(styleId);
        if (!tag) return;

        if (anim.strokes) {
          // Step 1: strip any lingering inline animation, set dasharray/dashoffset
          // so the path starts fully hidden and CSS can animate it.
          anim.strokes.forEach(function(seg){
            stripAnimationFromStyle(seg.el);
            // dasharray needs !important to override SVG attribute; dashoffset must NOT
            // use !important so the CSS @keyframes animation can override it.
            seg.el.style.setProperty('stroke-dasharray', '' + seg.len, 'important');
            seg.el.style.strokeDashoffset = seg.len;
            seg.el.style.display = '';
            seg.el.style.setProperty('stroke',  anim.drawColor, 'important');
            seg.el.style.setProperty('fill',    'none',         'important');
            seg.el.style.setProperty('opacity', '1',            'important');
          });
          if (anim._hideGlyphs) anim._hideGlyphs();
          // Step 2: force reflow so the browser commits the state before
          // we inject the renamed keyframe.
          void anim.strokes[0].el.getBoundingClientRect();
        }

        if (anim.text) {
          stripAnimationFromStyle(anim.text);
          anim.text.style.removeProperty('clip-path');
          anim.text.style.removeProperty('-webkit-clip-path');
          void anim.text.getBoundingClientRect();
        }

        // Step 3: inject renamed keyframes — browser sees a fresh animation name
        // and starts it from the beginning.
        var css = cm.getValue()
          .replace(/\bwipe-reveal\b/g, 'wipe-reveal-' + gen)
          .replace(/\bdraw\b/g, 'draw-' + gen);
        tag.textContent = css;
      }

      if (mode === 'css') {
        var restartTimer = null;
        cm.on('change', function () {
          fitHeight();
          clearTimeout(restartTimer);
          restartTimer = setTimeout(triggerCssPlay, 400);
        });
      }

      // Make URLs inside comment tokens clickable via markText.
      var URL_RE = /https?:\/\/[^\s*]+/g;
      cm.operation(function () {
        cm.eachLine(function (line) {
          var lineNo = cm.getLineNumber(line);
          var text   = line.text;
          var m;
          URL_RE.lastIndex = 0;
          while ((m = URL_RE.exec(text)) !== null) {
            var from = { line: lineNo, ch: m.index };
            var to   = { line: lineNo, ch: m.index + m[0].length };
            var a = document.createElement('a');
            a.href = m[0];
            a.target = '_blank';
            a.rel = 'noopener';
            a.textContent = m[0];
            a.style.cssText = 'color:#6ab0f5;text-decoration:none;pointer-events:all;';
            a.addEventListener('mouseenter', function () { this.style.textDecoration = 'underline'; });
            a.addEventListener('mouseleave', function () { this.style.textDecoration = 'none'; });
            cm.markText(from, to, { replacedWith: a, handleMouseEvents: true });
          }
        });
      });

      return function () {
        if (details) details.removeEventListener('toggle', onToggle);
        if (mode === 'css' && anim) {
          anim._triggerCssPlay = null;
          if (anim.reset) anim.reset();
        }
        var t = document.getElementById(styleId);
        if (t) t.remove();
      };
    }, []);

    return html`<div><div class="wh-css-editor" ref=${elRef}></div></div>`;
  }

  // ── WidgetControls (React component) ────────────────────────────────────────

  function WidgetControls({ anim, isClipped }) {
    var useRef    = React.useRef;
    var useState  = React.useState;
    var useEffect = React.useEffect;

    var rafRef        = useRef(null);
    var startTsRef    = useRef(0);
    var startProgRef  = useRef(0);
    var showingResult = useRef(false);
    var totalDuration = anim.getDuration();

    var _playing  = useState(false);
    var playing   = _playing[0],  setPlaying  = _playing[1];
    var _progress = useState(0);
    var progress  = _progress[0], setProgress = _progress[1];
    var _clipped  = useState(true);
    var clipped   = _clipped[0],  setClipped  = _clipped[1];

    var playingRef = useRef(playing);
    useEffect(function () { playingRef.current = playing; }, [playing]);

    function pause() {
      setPlaying(false);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }

    function tick(now) {
      if (!playingRef.current) return;
      var t = startProgRef.current + (now - startTsRef.current) / totalDuration;
      t = Math.min(t, 1);
      setProgress(t);
      anim.setProgress(t);
      if (t >= 1) {
          setPlaying(false);
          if (anim._triggerCssPlay) anim._triggerCssPlay();
          return;
        }
      rafRef.current = requestAnimationFrame(tick);
    }

    function resetKeepingToggle() {
      var wasClipped = clipped;
      anim.reset();
      // If raw-stroke was active before reset, re-apply it without flipping clipped state.
      if (!wasClipped && anim.toggleClippath) {
        anim.clippathShowing = true; // reset() set it true; toggleClippath flips to false
        anim.toggleClippath();
      }
    }

    function play() {
      if (showingResult.current || progress >= 1) {
        resetKeepingToggle();
        setProgress(0);
        showingResult.current = false;
        startProgRef.current  = 0;
      } else {
        startProgRef.current = progress;
      }
      setPlaying(true);
      startTsRef.current = performance.now();
      rafRef.current = requestAnimationFrame(tick);
    }

    function onPlayPause() { playing ? pause() : play(); }

    function onScrub(e) {
      pause();
      showingResult.current = false;
      var t = parseFloat(e.target.value);
      resetKeepingToggle();
      setProgress(t);
      anim.setProgress(t);
    }

    function onShowResult() {
      pause();
      showingResult.current = true;
      setProgress(1);
      anim.showResult();
    }

    function onToggleClippath() {
      setClipped(anim.toggleClippath());
    }

    return html`
      <div>
        <div class="wh-controls">
          <button type="button"
                  class=${'wh-btn' + (playing ? ' wh-btn--active' : '')}
                  onClick=${onPlayPause}>
            ${playing ? 'Pause' : 'Play'}
          </button>
          <input type="range" class="wh-scrub"
                 min="0" max="1" step="0.001"
                 value=${progress}
                 onInput=${onScrub}
                 aria-label="Scrub" />
          <button type="button" class="wh-btn" onClick=${onShowResult}>
            Show result
          </button>
          ${isClipped && html`
            <button type="button"
                    class=${'wh-btn' + (!clipped ? ' wh-btn--active' : '')}
                    onClick=${onToggleClippath}>
              ${clipped ? 'Raw stroke' : 'Clipped'}
            </button>`}
        </div>
        <details class="wh-details">
          <summary class="wh-details-summary">CSS</summary>
          <${CodeBlock} snippet=${anim.getCssSnippet()} mode="css" anim=${anim} />
        </details>
        <details class="wh-details">
          <summary class="wh-details-summary">HTML</summary>
          <${CodeBlock} snippet=${anim.getHtmlSnippet()} mode="htmlmixed" />
        </details>
      </div>`;
  }

  // ── Widget ───────────────────────────────────────────────────────────────────

  function Widget(root) {
    if (root.dataset.whInit) return;
    root.dataset.whInit = 'true';

    var mode = detectMode(root);
    var anim;
    if      (mode === 'wipe')           anim = new WipeAnimation(root);
    else if (mode === 'stroke-only')    anim = new StrokeOnlyAnimation(root);
    else if (mode === 'stroke-clipped') anim = new StrokeClippedAnimation(root);
    else return;

    anim.reset();

    var mountEl = root.querySelector('.wh-mount');
    if (!mountEl) return;

    ReactDOM.createRoot(mountEl).render(
      React.createElement(WidgetControls, {
        anim:      anim,
        isClipped: mode === 'stroke-clipped',
      })
    );
  }

  // ── Boot ─────────────────────────────────────────────────────────────────────

  function initAll() {
    document.querySelectorAll('.wh-widget').forEach(function (el) {
      new Widget(el);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();
