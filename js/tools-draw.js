// tools-draw.js — generic shape tools (polygon, rectangle)
// Loaded after runtime.js. Adds buttons to the "Draw Tools" sidebar section
// and defines the global startPolygonTool / startRectangleTool entry points.
//
// Pattern this file establishes for future tool files:
//   1. Wait for window.SitePlanRuntimeReady to resolve before running tool
//      setup — this guards against race conditions where this <script> runs
//      synchronously after runtime.js but before the ArcGIS require()
//      callback has finished populating window.SitePlanRuntime.
//   2. Define symbol(s) for the tool's graphics.
//   3. Define window.start<Name>Tool() functions that set the sketch symbol
//      and call sketch.create(...).
//   4. Append a button into the appropriate sidebar section element.
//
// Polygon and rectangle don't need lifecycle subscriptions (onGraphicUpdated /
// onGraphicDeleted) because they have no child graphics or overlays. Once
// created, they're just polygons that selection, rotation, label, and delete
// handle generically through the runtime.

if (!window.SitePlanRuntimeReady) {
  console.error('[tools-draw] window.SitePlanRuntimeReady is missing. ' +
    'Make sure js/runtime.js is loaded before js/tools-draw.js.');
} else {
  window.SitePlanRuntimeReady.then(RT => {

    // ── Symbols ──────────────────────────────────────────────
    const polygonSymbol = {
      type: 'simple-fill',
      color: [120, 160, 220, 0.30],
      outline: { type: 'simple-line', color: [40, 80, 160, 1], width: 1.5 }
    };

    const rectangleSymbol = {
      type: 'simple-fill',
      color: [225, 225, 225, 0.30],
      outline: { type: 'simple-line', color: [55, 55, 55, 1], width: 1.5 }
    };

    // ── Tool entry points ────────────────────────────────────
    window.startPolygonTool = function () {
      RT.clearSelection();
      RT.sketch.viewModel.polygonSymbol = polygonSymbol;
      try { RT.sketch.create('polygon'); }
      catch (err) { console.error('[tools-draw] Polygon create failed:', err); }
    };

    window.startRectangleTool = function () {
      RT.clearSelection();
      RT.sketch.viewModel.polygonSymbol = rectangleSymbol;
      try { RT.sketch.create('rectangle'); }
      catch (err) { console.error('[tools-draw] Rectangle create failed:', err); }
    };

    // ── Sidebar buttons ──────────────────────────────────────
    function buildToolButton(opts) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = opts.id;
      btn.className = 'tool-btn draw-tool-btn icon-btn';
      btn.title = opts.title || opts.label;
      btn.innerHTML = '<span class="tool-icon">' + opts.icon + '</span>' +
                      '<span class="tool-label">' + opts.label + '</span>';
      btn.addEventListener('click', opts.onClick);
      return btn;
    }

    const section = document.getElementById('tools-draw');
    if (!section) {
      console.warn('[tools-draw] Sidebar section #tools-draw not found.');
      return;
    }

    section.appendChild(buildToolButton({
      id: 'btn-polygon',
      label: 'Polygon',
      title: 'Draw a free-form polygon (click points, double-click to finish)',
      icon:
        '<svg viewBox="0 0 28 18" aria-hidden="true">' +
          '<polygon points="3,15 8,4 18,4 23,9 18,15" ' +
          'fill="rgba(120,160,220,0.30)" stroke="#2850a0" stroke-width="1.5"/>' +
        '</svg>',
      onClick: window.startPolygonTool
    }));

    section.appendChild(buildToolButton({
      id: 'btn-rectangle',
      label: 'Rectangle',
      title: 'Draw a rectangle (click and drag)',
      icon:
        '<svg viewBox="0 0 28 18" aria-hidden="true">' +
          '<rect x="4" y="4" width="20" height="10" ' +
          'fill="rgba(225,225,225,0.30)" stroke="#373737" stroke-width="1.5"/>' +
        '</svg>',
      onClick: window.startRectangleTool
    }));

  }).catch(err => {
    console.error('[tools-draw] Failed to initialize after runtime ready:', err);
  });
}
