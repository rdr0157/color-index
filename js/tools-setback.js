// tools-setback.js — setback measurement tool
// Loaded after runtime.js. Adds a setback-specific two-point polyline tool to
// the Structures sidebar section while keeping the setback lifecycle isolated
// from the structure and generic draw modules.

if (!window.SitePlanRuntimeReady) {
  console.error('[tools-setback] window.SitePlanRuntimeReady is missing. ' +
    'Make sure js/runtime.js is loaded before js/tools-setback.js.');
} else {
  window.SitePlanRuntimeReady.then(RT => {

    const SETBACK_TOOL_TYPE = 'setback';
    const SETBACK_BUTTON_ID = 'btn-setback-measurement';

    const setbackLineSymbol = {
      type: 'simple-line',
      color: [0, 0, 0, 1],
      width: 1.5,
      style: 'short-dash',
      marker: {
        style: 'arrow',
        placement: 'begin-end',
        color: [0, 0, 0, 1]
      }
    };

    const setbackLabelBaseSymbol = {
      type: 'text',
      text: '',
      color: [0, 0, 0, 1],
      haloColor: [255, 255, 255, 0.95],
      haloSize: 2,
      yoffset: -10,
      font: {
        family: 'Calibri, Segoe UI, Arial, sans-serif',
        size: 9,
        weight: 'bold'
      }
    };

    const setbackIcon =
      '<svg viewBox="0 0 28 18" aria-hidden="true">' +
        '<line x1="7" y1="9" x2="21" y2="9" stroke="#000" stroke-width="1.6" stroke-dasharray="3 2"></line>' +
        '<path d="M4 9l5-3v6z" fill="#000"></path>' +
        '<path d="M24 9l-5-3v6z" fill="#000"></path>' +
      '</svg>';

    let pendingSetback = false;
    let activeSetbackTool = false;
    let ignoreNextSketchCancel = false;

    function announceToolActivated() {
      try {
        window.dispatchEvent(new CustomEvent('siteplan:tool-activated', {
          detail: { source: 'tools-setback', tool: SETBACK_TOOL_TYPE }
        }));
      } catch (err) {}
    }

    window.addEventListener('siteplan:tool-activated', event => {
      const detail = event && event.detail ? event.detail : {};
      if (detail.source === 'tools-setback') return;
      clearActiveSetbackButton();
      pendingSetback = false;
      activeSetbackTool = false;
      if (window.__sitePlanPendingToolType === SETBACK_TOOL_TYPE) window.__sitePlanPendingToolType = null;
    });

    function setActiveSetbackButton(active) {
      activeSetbackTool = !!active;
      const btn = document.getElementById(SETBACK_BUTTON_ID);
      if (btn) btn.classList.toggle('active', activeSetbackTool);
    }

    function clearActiveSetbackButton() {
      setActiveSetbackButton(false);
    }

    function isSetbackGraphic(graphic) {
      return !!(graphic && graphic.__toolType === SETBACK_TOOL_TYPE &&
        graphic.geometry && graphic.geometry.type === 'polyline');
    }

    function cloneSymbol(symbol) {
      if (!symbol) return null;
      if (symbol.clone) return symbol.clone();
      try { return JSON.parse(JSON.stringify(symbol)); }
      catch (err) { return Object.assign({}, symbol); }
    }

    function spatialReferenceJSON(spatialReference) {
      return spatialReference && spatialReference.toJSON ? spatialReference.toJSON() : spatialReference;
    }

    function distinctEndpointFromEnd(path, first) {
      if (!path || !path.length) return null;
      for (let i = path.length - 1; i >= 0; i--) {
        const candidate = path[i];
        if (!candidate) continue;
        if (!first || candidate[0] !== first[0] || candidate[1] !== first[1]) return candidate;
      }
      return path[path.length - 1] || null;
    }

    function setbackEndpoints(geometry) {
      if (!geometry || geometry.type !== 'polyline' || !geometry.paths || !geometry.paths.length) return null;
      const path = geometry.paths.find(p => p && p.length >= 2) || geometry.paths[0];
      if (!path || path.length < 2) return null;
      const first = path[0];
      const last = distinctEndpointFromEnd(path, first);
      if (!first || !last) return null;
      return { first, last, spatialReference: geometry.spatialReference };
    }

    function normalizeSetbackGeometry(graphic) {
      const endpoints = setbackEndpoints(graphic && graphic.geometry);
      if (!endpoints) return false;

      const json = {
        type: 'polyline',
        paths: [[endpoints.first, endpoints.last]],
        spatialReference: spatialReferenceJSON(endpoints.spatialReference)
      };

      try {
        if (graphic.geometry.constructor && graphic.geometry.constructor.fromJSON) {
          graphic.geometry = graphic.geometry.constructor.fromJSON(json);
          return true;
        }
      } catch (err) {}

      graphic.geometry = json;
      return true;
    }

    function midpointFromEndpoints(endpoints) {
      if (!endpoints || !endpoints.first || !endpoints.last) return null;
      return {
        type: 'point',
        x: (endpoints.first[0] + endpoints.last[0]) / 2,
        y: (endpoints.first[1] + endpoints.last[1]) / 2,
        spatialReference: spatialReferenceJSON(endpoints.spatialReference)
      };
    }

    function setbackLengthText(geometry) {
      if (!geometry) return '';
      let feet = 0;
      try { feet = Math.abs(RT.geometryEngine.geodesicLength(geometry, 'feet') || 0); }
      catch (err) {}
      if (!Number.isFinite(feet) || feet <= 0) {
        try { feet = Math.abs(RT.geometryEngine.planarLength(geometry, 'feet') || 0); }
        catch (err) {}
      }
      if (!Number.isFinite(feet) || feet <= 0) return '0.0 ft';
      return feet.toLocaleString('en-US', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
      }) + ' ft';
    }

    function labelForSetback(graphic) {
      const id = graphic && graphic.__sitePlanId;
      if (!id) return null;
      return RT.labelLayer.graphics.find(g => g.__setbackLabelFor === id) || null;
    }

    function createOrUpdateSetbackLabel(graphic) {
      if (!isSetbackGraphic(graphic) || !graphic.__sitePlanId) return null;
      const endpoints = setbackEndpoints(graphic.geometry);
      const anchor = midpointFromEndpoints(endpoints);
      if (!anchor) return null;

      const symbol = Object.assign({}, setbackLabelBaseSymbol, {
        text: setbackLengthText(graphic.geometry)
      });

      let label = labelForSetback(graphic);
      if (!label) {
        label = new RT.Graphic({ geometry: anchor, symbol });
        label.__nonSelectable = true;
        label.__toolType = SETBACK_TOOL_TYPE;
        label.__setbackLabelFor = graphic.__sitePlanId;
        label.attributes = {
          sitePlanTool: 'setbackLabel',
          sitePlanCategory: 'annotation',
          parentGraphicId: graphic.__sitePlanId
        };
        RT.labelLayer.add(label);
      } else {
        label.geometry = anchor;
        label.symbol = symbol;
      }
      return label;
    }

    function removeSetbackLabel(graphic) {
      const label = labelForSetback(graphic);
      if (label) RT.labelLayer.remove(label);
    }

    function tagAsSetback(graphic) {
      if (!graphic) return;
      graphic.__toolType = SETBACK_TOOL_TYPE;
      graphic.__preferredEditMode = 'reshape';
      graphic.__allowResize = false;
      graphic.symbol = cloneSymbol(setbackLineSymbol);
      graphic.attributes = Object.assign({}, graphic.attributes || {}, {
        sitePlanTool: 'setback',
        sitePlanCategory: 'structure',
        preferredEditMode: 'reshape',
        allowResize: false
      });
    }

    function cancelActiveSketchForSetbackRestart() {
      if (RT.sketch && RT.sketch.state === 'active') {
        ignoreNextSketchCancel = true;
        try { RT.sketch.cancel(); }
        catch (err) { ignoreNextSketchCancel = false; }
      }
    }

    function startSetbackTool() {
      announceToolActivated();
      pendingSetback = true;
      window.__sitePlanPendingToolType = SETBACK_TOOL_TYPE;

      // Setback measurements are vertex/endpoint-edited objects. Keep the
      // broader editing UI aligned with the object's required edit behavior.
      if (typeof window.setEditMode === 'function') window.setEditMode('reshape');

      RT.clearSelection();
      cancelActiveSketchForSetbackRestart();
      setActiveSetbackButton(true);

      try {
        RT.sketch.viewModel.polylineSymbol = cloneSymbol(setbackLineSymbol);
      } catch (err) {}

      try {
        RT.sketch.create('polyline', { mode: 'click', symbol: cloneSymbol(setbackLineSymbol) });
      } catch (err) {
        clearActiveSetbackButton();
        pendingSetback = false;
        window.__sitePlanPendingToolType = null;
        console.error('[tools-setback] create failed:', err);
      }
    }

    RT.sketch.on('create', event => {
      if (event.state === 'cancel') {
        if (ignoreNextSketchCancel) {
          ignoreNextSketchCancel = false;
          return;
        }
        if (activeSetbackTool || pendingSetback) clearActiveSetbackButton();
        pendingSetback = false;
        if (window.__sitePlanPendingToolType === SETBACK_TOOL_TYPE) window.__sitePlanPendingToolType = null;
        return;
      }

      if (event.state === 'complete') {
        if (activeSetbackTool || pendingSetback) clearActiveSetbackButton();
      }
    });

    RT.onGraphicCreated(graphic => {
      if (pendingSetback) tagAsSetback(graphic);
      if (!isSetbackGraphic(graphic)) return;

      normalizeSetbackGeometry(graphic);
      tagAsSetback(graphic);
      createOrUpdateSetbackLabel(graphic);
      RT.refreshSnapSources();

      pendingSetback = false;
      if (window.__sitePlanPendingToolType === SETBACK_TOOL_TYPE) window.__sitePlanPendingToolType = null;
    });

    RT.onGraphicUpdated((graphic, sketchEvent) => {
      if (!isSetbackGraphic(graphic)) return;
      const state = sketchEvent && sketchEvent.state;
      if (state === 'complete' || state === 'cancel') normalizeSetbackGeometry(graphic);
      createOrUpdateSetbackLabel(graphic);
      if (state === 'complete') RT.refreshSnapSources();
    });

    RT.onGraphicDeleted(graphic => {
      if (!isSetbackGraphic(graphic)) return;
      removeSetbackLabel(graphic);
    });

    function buildSetbackButton() {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = SETBACK_BUTTON_ID;
      btn.className = 'tool-btn draw-tool-btn icon-btn';
      btn.title = 'Draw a setback measurement. Endpoint vertices can be adjusted in Reshape mode.';
      btn.innerHTML = '<span class="tool-icon icon-setback">' + setbackIcon + '</span>' +
                      '<span class="tool-label">Setback measurement</span>';
      btn.addEventListener('click', startSetbackTool);
      return btn;
    }

    const section = document.getElementById('tools-structures');
    if (!section) {
      console.warn('[tools-setback] Sidebar section #tools-structures not found.');
      return;
    }

    section.appendChild(buildSetbackButton());
    window.startSetbackTool = startSetbackTool;

  }).catch(err => {
    console.error('[tools-setback] Failed to initialize after runtime ready:', err);
  });
}
