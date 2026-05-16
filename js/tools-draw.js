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

    // Tag the next created graphic with __toolType. The runtime reads
    // window.__sitePlanPendingToolType on sketch 'start' to apply rectangle-
    // vs-polygon side-label rules during the live drawing preview. After the
    // graphic is created we also apply __toolType to it via onGraphicCreated
    // (and into graphic.attributes) so future export / print / legend code can
    // distinguish polygon vs rectangle without geometric guesswork.
    let pendingDrawTool = null;

    // ── Active button state ──────────────────────────────────
    function setActiveDrawButton(toolType) {
      document.querySelectorAll('.draw-tool-btn.icon-btn').forEach(btn => {
        btn.classList.remove('active');
      });
      const id = toolType === 'rectangle' ? 'btn-rectangle' :
                 toolType === 'polygon' ? 'btn-polygon' : null;
      if (id) {
        const btn = document.getElementById(id);
        if (btn) btn.classList.add('active');
      }
    }

    function clearActiveDrawButton() {
      setActiveDrawButton(null);
    }

    // ── Tool entry points ────────────────────────────────────
    // When the user clicks a different draw tool while Sketch is already
    // active, Sketch emits a cancel event for the old tool. Without this
    // guard, that old cancel event can clear the active highlight that was
    // just applied to the newly selected tool.
    let ignoreNextSketchCancel = false;

    function beginDrawTool(toolType, geometryType, symbol) {
      pendingDrawTool = toolType;
      window.__sitePlanPendingToolType = toolType;

      RT.clearSelection();

      if (RT.sketch && RT.sketch.state === 'active') {
        ignoreNextSketchCancel = true;
        try { RT.sketch.cancel(); }
        catch (err) { ignoreNextSketchCancel = false; }
      }

      setActiveDrawButton(toolType);
      RT.sketch.viewModel.polygonSymbol = symbol;

      try {
        RT.sketch.create(geometryType);
      } catch (err) {
        clearActiveDrawButton();
        pendingDrawTool = null;
        window.__sitePlanPendingToolType = null;
        console.error('[tools-draw] ' + toolType + ' create failed:', err);
      }
    }

    window.startPolygonTool = function () {
      beginDrawTool('polygon', 'polygon', polygonSymbol);
    };

    window.startRectangleTool = function () {
      beginDrawTool('rectangle', 'rectangle', rectangleSymbol);
    };

    RT.sketch.on('create', event => {
      if (event.state === 'cancel') {
        if (ignoreNextSketchCancel) {
          ignoreNextSketchCancel = false;
          return;
        }
        clearActiveDrawButton();
        pendingDrawTool = null;
        window.__sitePlanPendingToolType = null;
        return;
      }

      if (event.state === 'complete') {
        clearActiveDrawButton();
      }
    });

    // Apply the tag and clear the pending state on every new graphic created
    // while a draw tool is active. Other tool files later in the load order
    // will follow this same pattern with their own pendingDrawTool variable.
    RT.onGraphicCreated(g => {
      if (!pendingDrawTool) return;
      g.__toolType = pendingDrawTool;
      g.attributes = Object.assign({}, g.attributes || {}, {
        sitePlanTool: pendingDrawTool
      });
      pendingDrawTool = null;
      window.__sitePlanPendingToolType = null;
    });

    // ── Sidebar buttons ──────────────────────────────────────
    function buildToolButton(opts) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = opts.id;
      btn.className = 'tool-btn draw-tool-btn icon-btn';
      btn.title = opts.title || opts.label;
      btn.innerHTML = '<span class="tool-icon ' + (opts.iconClass || '') + '">' + opts.icon + '</span>' +
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
      iconClass: 'icon-polygon',
      icon:
        '<svg viewBox="0 0 28 18" aria-hidden="true">' +
          '<polygon points="6,13 10,4 21,5 23,12 14,15" ' +
          'fill="rgba(0,0,0,0.03)" stroke="#000" stroke-width="1.6"></polygon>' +
        '</svg>',
      onClick: window.startPolygonTool
    }));

    section.appendChild(buildToolButton({
      id: 'btn-rectangle',
      label: 'Rectangle',
      title: 'Draw a rectangle (click and drag)',
      iconClass: 'icon-rectangle',
      icon:
        '<svg viewBox="0 0 28 18" aria-hidden="true">' +
          '<rect x="5" y="4" width="18" height="10" rx="1" fill="none" stroke="#000" stroke-width="1.6"></rect>' +
        '</svg>',
      onClick: window.startRectangleTool
    }));

  }).catch(err => {
    console.error('[tools-draw] Failed to initialize after runtime ready:', err);
  });
}
