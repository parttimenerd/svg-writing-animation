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
    this.duration = 1800;
  }

  WipeAnimation.prototype.reset = function () {
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
    return '<span class="wh-wipe-text">Wir heiraten</span>';
  };

  WipeAnimation.prototype.getCssSnippet = function () {
    var dur = (this.duration / 1000).toFixed(1) + 's';
    return [
      '/* clip-path: inset(top right bottom left)',
      ' * mdn: https://developer.mozilla.org/en-US/docs/Web/CSS/clip-path',
      ' * Top/bottom -50% covers ascenders/descenders. Left stays 0.',
      ' * Right inset: 100% = hidden, 0% = revealed. */',
      '.wh-wipe-text {',
      '  clip-path: inset(-50% 100% -50% 0);',
      '  animation: wipe-reveal ' + dur + ' linear forwards;',
      '}',
      '',
      '@keyframes wipe-reveal {',
      '  to { clip-path: inset(-50% 0% -50% 0); }',
      '}',
    ].join('\n');
  };

  // ── StrokeAnimation (base) ───────────────────────────────────────────────────

  function StrokeAnimation(root) {
    this.svg = root.querySelector('svg');
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
      this.svg.querySelectorAll('[id^="text"]'), 'text'
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
      seg.el.style.animation = 'none';
      seg.el.style.display   = '';
      seg.el.style.setProperty('stroke',  self.drawColor, 'important');
      seg.el.style.setProperty('fill',    'none',         'important');
      seg.el.style.setProperty('opacity', '1',            'important');
    });
  };

  StrokeAnimation.prototype._hideGlyphs = function () {
    this.glyphs.forEach(function (g) {
      g.el.style.setProperty('fill',   'none', 'important');
      g.el.style.setProperty('stroke', 'none', 'important');
    });
  };

  StrokeAnimation.prototype._showGlyphs = function () {
    this.strokes.forEach(function (seg) { seg.el.style.display = 'none'; });
    this.glyphs.forEach(function (g) {
      g.el.setAttribute('style', g.originalStyle);
    });
  };

  // Shared CSS header comment explaining the dasharray/dashoffset technique.
  // Used by both StrokeOnly and StrokeClipped snippets.
  StrokeAnimation.prototype._dashComment = function () {
    var lens = this.strokes.map(function (s) { return Math.round(s.len); });
    return [
      '/* stroke-dasharray / stroke-dashoffset - the drawing trick',
      ' * mdn: https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-dashoffset',
      ' *',
      ' * The SVG paths have stroke-dasharray and stroke-dashoffset set as inline',
      ' * styles (see HTML tab) - Inkscape writes these automatically when you',
      ' * export a path with a dashed stroke. dasharray=N makes one dash the full',
      ' * path length. dashoffset=N shifts it off so the path starts invisible.',
      ' * Animating dashoffset to 0 slides it back: the line draws itself.',
      ' *',
      ' * Lengths: ' + lens.map(function(l, i){ return '#clippath'+(i+1)+'='+l; }).join(', ') + '.',
      ' *',
      ' * Each path has its own delay so strokes sequence one after another. */',
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
    var lines = [ this._dashComment(), '' ];
    this.strokes.forEach(function (seg, i) {
      var dur = (seg.dur / 1000).toFixed(2).replace(/\.?0+$/, '') + 's';
      var del = seg.delayMs > 0
        ? (seg.delayMs / 1000).toFixed(2).replace(/\.?0+$/, '') + 's'
        : '0s';
      lines.push(
        '#clippath' + (i + 1) + ' {',
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
      // Back to clipped: restore clip-path, full opacity, hide glyphs.
      this.strokes.forEach(function (seg) {
        if (seg.originalClipPath) seg.el.setAttribute('clip-path', seg.originalClipPath);
        seg.el.style.setProperty('opacity', '1', 'important');
        seg.el.style.display = '';
      });
      this.glyphs.forEach(function (g) {
        g.el.style.setProperty('fill',   'none', 'important');
        g.el.style.setProperty('stroke', 'none', 'important');
      });
    } else {
      // Raw stroke: remove clip-path, half opacity, show glyphs behind.
      this.strokes.forEach(function (seg) {
        seg.el.removeAttribute('clip-path');
        seg.el.style.setProperty('opacity', '0.5', 'important');
        seg.el.style.display = '';
      });
      this.glyphs.forEach(function (g) {
        g.el.setAttribute('style', g.originalStyle);
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
    var lines = [];

    this.strokes.forEach(function (seg, i) {
      var n = i + 1;
      lines.push(
        '#clippath' + n + ' {',
        '  clip-path: ' + seg.originalClipPath + ';',
        '}',
        ''
      );
    });

    lines.push(
      this._dashComment(),
      ''
    );

    this.strokes.forEach(function (seg, i) {
      var dur = (seg.dur / 1000).toFixed(2).replace(/\.?0+$/, '') + 's';
      var del = seg.delayMs > 0
        ? (seg.delayMs / 1000).toFixed(2).replace(/\.?0+$/, '') + 's'
        : '0s';
      lines.push(
        '#clippath' + (i + 1) + ' {',
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

      function triggerCssPlay() {
        if (!anim) return;
        playGen++;
        var gen = playGen;
        var tag = document.getElementById(styleId);
        if (!tag) return;
        // Rename keyframes so the browser treats them as a new animation.
        var css = cm.getValue()
          .replace(/\bwipe-reveal\b/g, 'wipe-reveal-' + gen)
          .replace(/\bdraw\b/g, 'draw-' + gen);
        tag.textContent = css;
        // Clear animation/dashoffset inline styles so CSS @keyframes takes over,
        // but keep stroke/fill/opacity set by _prepareStrokes.
        if (anim.strokes) {
          anim.strokes.forEach(function(seg){
            seg.el.style.animation        = '';
            seg.el.style.strokeDasharray  = '';
            seg.el.style.strokeDashoffset = '';
            seg.el.style.display          = '';
            seg.el.style.setProperty('stroke',  anim.drawColor, 'important');
            seg.el.style.setProperty('fill',    'none',         'important');
            seg.el.style.setProperty('opacity', '1',            'important');
          });
          if (anim._hideGlyphs) anim._hideGlyphs();
        }
        if (anim.text) {
          anim.text.style.clipPath       = '';
          anim.text.style.webkitClipPath = '';
          anim.text.style.animation      = '';
        }
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

    function play() {
      if (showingResult.current || progress >= 1) {
        anim.reset();
        setClipped(true);
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
      anim.reset();
      setClipped(true);
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
