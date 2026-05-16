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
      color: [225, 225, 225, 0.20],
      outline: { type: 'simple-line', color: [55, 55, 55, 1], width: 1.5 }
    };

    const rectangleSymbol = {
      type: 'simple-fill',
      color: [225, 225, 225, 0.20],
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
    let activeDrawTool = null;

    function setActiveDrawButton(toolType) {
      activeDrawTool = toolType || null;
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

    function isRectangleToolActive() {
      return activeDrawTool === 'rectangle';
    }

    // ── Tool entry points ────────────────────────────────────
    // When the user clicks a different draw tool while Sketch is already
    // active, Sketch emits a cancel event for the old tool. Without this
    // guard, that old cancel event can clear the active highlight that was
    // just applied to the newly selected tool.
    let ignoreNextSketchCancel = false;

    // ── Fixed-size rectangle placement ───────────────────────
    // When enabled, Rectangle becomes a click-to-place tool that creates a
    // rectangle using the entered L × W dimensions in feet. The inputs remain
    // editable even when the checkbox is not checked; validation only blocks
    // drawing when Fixed size is checked and dimensions are missing/invalid.
    let fixedRectangleClickHandle = null;
    let fixedRectangleEscHandler = null;

    function fixedRectangleEls() {
      return {
        checkbox: document.getElementById('chk-rectangle-fixed'),
        length: document.getElementById('rectangle-l'),
        width: document.getElementById('rectangle-w')
      };
    }

    function isFixedRectangleMode() {
      const els = fixedRectangleEls();
      return !!(els.checkbox && els.checkbox.checked);
    }

    function fixedRectangleDimensions() {
      const els = fixedRectangleEls();
      const lengthFt = els.length ? Number.parseFloat(els.length.value) : NaN;
      const widthFt = els.width ? Number.parseFloat(els.width.value) : NaN;
      return {
        lengthFt,
        widthFt,
        valid: Number.isFinite(lengthFt) && lengthFt >= 1 &&
               Number.isFinite(widthFt) && widthFt >= 1
      };
    }

    function markFixedRectangleValidity() {
      const els = fixedRectangleEls();
      const dims = fixedRectangleDimensions();
      const lengthValid = Number.isFinite(dims.lengthFt) && dims.lengthFt >= 1;
      const widthValid = Number.isFinite(dims.widthFt) && dims.widthFt >= 1;
      if (els.length) els.length.classList.toggle('invalid', !lengthValid);
      if (els.width) els.width.classList.toggle('invalid', !widthValid);
      return dims.valid;
    }

    function clearFixedRectangleValidation() {
      const els = fixedRectangleEls();
      if (els.length) els.length.classList.remove('invalid');
      if (els.width) els.width.classList.remove('invalid');
    }

    function focusFirstInvalidFixedRectangleInput() {
      const els = fixedRectangleEls();
      const dims = fixedRectangleDimensions();
      const lengthValid = Number.isFinite(dims.lengthFt) && dims.lengthFt >= 1;
      if (!lengthValid && els.length) { els.length.focus(); return; }
      if (els.width) els.width.focus();
    }

    function cancelFixedRectanglePlacement(clearButtonState) {
      if (fixedRectangleClickHandle) {
        try { fixedRectangleClickHandle.remove(); } catch (err) {}
        fixedRectangleClickHandle = null;
      }
      if (fixedRectangleEscHandler) {
        document.removeEventListener('keydown', fixedRectangleEscHandler, true);
        fixedRectangleEscHandler = null;
      }
      if (clearButtonState) clearActiveDrawButton();
    }

    function makeRectangleGeometryFromCenter(center, lengthFt, widthFt) {
      if (!center) return null;
      const sr = center.spatialReference || (RT.view && RT.view.spatialReference);
      const lengthUnits = feetToLocalMapUnits(lengthFt, center, sr);
      const widthUnits = feetToLocalMapUnits(widthFt, center, sr);
      let halfX, halfY;
      if (typeof lengthUnits === 'object') halfX = lengthUnits.dx / 2;
      else halfX = lengthUnits / 2;
      if (typeof widthUnits === 'object') halfY = widthUnits.dy / 2;
      else halfY = widthUnits / 2;

      return {
        type: 'polygon',
        rings: [[
          [center.x - halfX, center.y - halfY],
          [center.x + halfX, center.y - halfY],
          [center.x + halfX, center.y + halfY],
          [center.x - halfX, center.y + halfY],
          [center.x - halfX, center.y - halfY]
        ]],
        spatialReference: sr && sr.toJSON ? sr.toJSON() : sr
      };
    }

    function placeFixedRectangleAt(mapPoint) {
      const dims = fixedRectangleDimensions();
      if (!dims.valid) {
        markFixedRectangleValidity();
        focusFirstInvalidFixedRectangleInput();
        return;
      }
      const geometry = makeRectangleGeometryFromCenter(mapPoint, dims.lengthFt, dims.widthFt);
      if (!geometry) return;

      const graphic = new RT.Graphic({
        geometry,
        symbol: rectangleSymbol,
        attributes: {
          sitePlanTool: 'rectangle',
          fixedSize: true,
          fixedLengthFt: dims.lengthFt,
          fixedWidthFt: dims.widthFt,
          useFixedSizeLabels: true
        }
      });
      graphic.__toolType = 'rectangle';
      graphic.__fixedSize = true;
      graphic.__fixedLengthFt = dims.lengthFt;
      graphic.__fixedWidthFt = dims.widthFt;
      graphic.__useFixedSizeLabels = true;

      cancelFixedRectanglePlacement(false);
      clearActiveDrawButton();
      RT.registerDrawableGraphic(graphic);
      if (typeof RT.refreshSideLabelsForGraphic === 'function') RT.refreshSideLabelsForGraphic(graphic);

      const reselect = () => {
        try { RT.selectGraphic(graphic); }
        catch (err) { console.warn('[tools-draw] Unable to select fixed rectangle.', err); }
      };
      if (window.requestAnimationFrame) window.requestAnimationFrame(reselect);
      else setTimeout(reselect, 0);
    }

    function startFixedRectanglePlacement() {
      if (!markFixedRectangleValidity()) {
        cancelFixedRectanglePlacement(false);
        setActiveDrawButton('rectangle');
        focusFirstInvalidFixedRectangleInput();
        return;
      }

      clearFixedRectangleValidation();
      pendingDrawTool = null;
      window.__sitePlanPendingToolType = null;
      RT.clearSelection();

      if (RT.sketch && RT.sketch.state === 'active') {
        ignoreNextSketchCancel = true;
        try { RT.sketch.cancel(); }
        catch (err) { ignoreNextSketchCancel = false; }
      }

      cancelFixedRectanglePlacement(false);
      setActiveDrawButton('rectangle');

      fixedRectangleClickHandle = RT.view.on('click', event => {
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        placeFixedRectangleAt(event.mapPoint);
      });

      fixedRectangleEscHandler = function (event) {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          cancelFixedRectanglePlacement(true);
        }
      };
      document.addEventListener('keydown', fixedRectangleEscHandler, true);
    }

    let lastRectangleSettingsSignature = null;

    function fixedRectangleSettingsSignature() {
      const dims = fixedRectangleDimensions();
      return [
        isFixedRectangleMode() ? 'fixed' : 'manual',
        Number.isFinite(dims.lengthFt) ? dims.lengthFt : '',
        Number.isFinite(dims.widthFt) ? dims.widthFt : '',
        dims.valid ? 'valid' : 'invalid'
      ].join('|');
    }

    function cancelActiveSketchForRectangleRestart() {
      if (RT.sketch && RT.sketch.state === 'active') {
        ignoreNextSketchCancel = true;
        try { RT.sketch.cancel(); }
        catch (err) { ignoreNextSketchCancel = false; }
      }
    }

    function restartRectangleToolIfActive(options) {
      if (!isRectangleToolActive()) return;

      const opts = options || {};
      const signature = fixedRectangleSettingsSignature();
      if (!opts.force && signature === lastRectangleSettingsSignature) return;
      lastRectangleSettingsSignature = signature;

      cancelFixedRectanglePlacement(false);
      cancelActiveSketchForRectangleRestart();

      pendingDrawTool = null;
      window.__sitePlanPendingToolType = null;
      setActiveDrawButton('rectangle');

      if (isFixedRectangleMode()) {
        const valid = markFixedRectangleValidity();
        if (!valid) {
          if (opts.focusInvalid) focusFirstInvalidFixedRectangleInput();
          return;
        }
        startFixedRectanglePlacement();
        return;
      }

      beginDrawTool('rectangle', 'rectangle', rectangleSymbol);
    }

    function beginDrawTool(toolType, geometryType, symbol) {
      // If the user previously tried to start a fixed-size rectangle without
      // valid dimensions, clear that temporary validation warning when they
      // move on to another normal draw tool.
      clearFixedRectangleValidation();
      cancelFixedRectanglePlacement(false);
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
      lastRectangleSettingsSignature = fixedRectangleSettingsSignature();
      if (isFixedRectangleMode()) {
        startFixedRectanglePlacement();
        return;
      }
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
    // ── Rectangle invalid-size fallback ──────────────────────────────
    // Rectangles are click-and-drag objects. If the user mis-clicks or releases
    // too quickly, Sketch can finalize a near-zero rectangle that is difficult
    // to grab, resize, or delete. Treat that as an accidental click-to-place
    // rectangle and replace it with a usable 10 ft × 10 ft starter rectangle.
    const MIN_RECT_SIDE_FT = 2;
    const MIN_RECT_AREA_SQFT = 4;
    const DEFAULT_RECT_SIDE_FT = 10;

    function ringWithoutDuplicateClose(geometry) {
      if (!geometry || geometry.type !== 'polygon' || !geometry.rings || !geometry.rings.length) return [];
      const ring = geometry.rings[0] || [];
      if (ring.length > 2) {
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first && last && first[0] === last[0] && first[1] === last[1]) {
          return ring.slice(0, -1);
        }
      }
      return ring.slice();
    }

    function segmentLengthFt(a, b, spatialReference) {
      if (!a || !b) return 0;
      const segment = {
        type: 'polyline',
        paths: [[a, b]],
        spatialReference
      };
      let length = 0;
      try { length = Math.abs(RT.geometryEngine.geodesicLength(segment, 'feet') || 0); }
      catch (err) {}
      if (!Number.isFinite(length) || length <= 0) {
        try { length = Math.abs(RT.geometryEngine.planarLength(segment, 'feet') || 0); }
        catch (err) {}
      }
      return Number.isFinite(length) ? length : 0;
    }

    function polygonAreaSqFt(geometry) {
      let area = 0;
      try { area = Math.abs(RT.geometryEngine.geodesicArea(geometry, 'square-feet') || 0); }
      catch (err) {}
      if (!Number.isFinite(area) || area <= 0) {
        try { area = Math.abs(RT.geometryEngine.planarArea(geometry, 'square-feet') || 0); }
        catch (err) {}
      }
      return Number.isFinite(area) ? area : 0;
    }

    function rectangleDimensionsFt(geometry) {
      const pts = ringWithoutDuplicateClose(geometry);
      if (pts.length < 4) return { widthFt: 0, heightFt: 0, areaSqFt: polygonAreaSqFt(geometry) };
      return {
        widthFt: segmentLengthFt(pts[0], pts[1], geometry.spatialReference),
        heightFt: segmentLengthFt(pts[1], pts[2], geometry.spatialReference),
        areaSqFt: polygonAreaSqFt(geometry)
      };
    }

    function isTooSmallRectangle(geometry) {
      const dims = rectangleDimensionsFt(geometry);
      return dims.widthFt < MIN_RECT_SIDE_FT ||
             dims.heightFt < MIN_RECT_SIDE_FT ||
             dims.areaSqFt < MIN_RECT_AREA_SQFT;
    }

    function webMercatorLatRadiansFromY(y) {
      const radius = 6378137;
      return (2 * Math.atan(Math.exp(y / radius))) - (Math.PI / 2);
    }

    function feetToLocalMapUnits(feet, center, spatialReference) {
      const meters = feet * 0.3048;
      const wkid = spatialReference && (spatialReference.wkid || spatialReference.latestWkid);

      // ArcGIS basemaps normally place the view in Web Mercator. Web Mercator
      // local map distance is scaled by sec(latitude), so divide by cos(lat) to
      // get an approximate ground-distance square at the parcel's latitude.
      if (wkid === 3857 || wkid === 102100 || wkid === 102113) {
        const latRad = webMercatorLatRadiansFromY(center.y);
        const cosLat = Math.max(Math.abs(Math.cos(latRad)), 0.2);
        return meters / cosLat;
      }

      // Geographic fallback, unlikely for this app but useful if the map SR is
      // ever changed. Return degrees for the requested ground distance.
      if (wkid === 4326 || (spatialReference && spatialReference.isGeographic)) {
        const latRad = (center.y || 0) * Math.PI / 180;
        const feetPerDegreeLat = 364000;
        const feetPerDegreeLon = Math.max(feetPerDegreeLat * Math.cos(latRad), 1);
        return {
          dx: feet / feetPerDegreeLon,
          dy: feet / feetPerDegreeLat
        };
      }

      // Projected fallback: assume meters. This keeps the starter object usable
      // even if it is not survey-grade exact.
      return meters;
    }

    function makeDefaultRectangleGeometry(sourceGeometry) {
      const center = sourceGeometry && sourceGeometry.extent && sourceGeometry.extent.center;
      if (!center) return null;
      const sr = sourceGeometry.spatialReference || (center && center.spatialReference);
      const units = feetToLocalMapUnits(DEFAULT_RECT_SIDE_FT, center, sr);
      let halfX, halfY;
      if (typeof units === 'object') {
        halfX = units.dx / 2;
        halfY = units.dy / 2;
      } else {
        halfX = units / 2;
        halfY = units / 2;
      }

      const json = {
        rings: [[
          [center.x - halfX, center.y - halfY],
          [center.x + halfX, center.y - halfY],
          [center.x + halfX, center.y + halfY],
          [center.x - halfX, center.y + halfY],
          [center.x - halfX, center.y - halfY]
        ]],
        spatialReference: sr && sr.toJSON ? sr.toJSON() : sr
      };

      try {
        if (sourceGeometry.constructor && sourceGeometry.constructor.fromJSON) {
          return sourceGeometry.constructor.fromJSON(json);
        }
      } catch (err) {}

      return Object.assign({ type: 'polygon' }, json);
    }

    function replaceInvalidRectangleIfNeeded(graphic) {
      if (!graphic || graphic.__toolType !== 'rectangle' || !graphic.geometry) return false;
      if (!isTooSmallRectangle(graphic.geometry)) return false;

      const replacement = makeDefaultRectangleGeometry(graphic.geometry);
      if (!replacement) return false;

      graphic.geometry = replacement;
      graphic.__usedDefaultRectangleSize = true;
      graphic.attributes = Object.assign({}, graphic.attributes || {}, {
        usedDefaultRectangleSize: true,
        defaultRectangleSizeFt: DEFAULT_RECT_SIDE_FT
      });
      RT.refreshSnapSources();

      // Re-select on the next frame so Sketch transform handles and the selected
      // shape box sync to the replacement geometry rather than the near-zero one.
      const reselect = () => {
        try { RT.selectGraphic(graphic); }
        catch (err) { console.warn('[tools-draw] Unable to reselect default rectangle.', err); }
      };
      if (window.requestAnimationFrame) window.requestAnimationFrame(reselect);
      else setTimeout(reselect, 0);

      return true;
    }

    RT.onGraphicCreated(g => {
      if (!pendingDrawTool) return;
      g.__toolType = pendingDrawTool;
      g.attributes = Object.assign({}, g.attributes || {}, {
        sitePlanTool: pendingDrawTool
      });

      if (pendingDrawTool === 'rectangle') {
        replaceInvalidRectangleIfNeeded(g);
      }

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

    const fixedSizeRow = document.createElement('div');
    fixedSizeRow.className = 'size-row';
    fixedSizeRow.innerHTML =
      '<input type="checkbox" id="chk-rectangle-fixed">' +
      '<label for="chk-rectangle-fixed" class="size-lbl">Fixed size</label>' +
      '<input id="rectangle-l" type="number" min="1" step="1" placeholder="L" class="dim-input" aria-label="Rectangle length in feet">' +
      '<span class="dim-sep">×</span>' +
      '<input id="rectangle-w" type="number" min="1" step="1" placeholder="W" class="dim-input" aria-label="Rectangle width in feet">' +
      '<span class="dim-sep">ft</span>';
    section.appendChild(fixedSizeRow);

    const fixedEls = fixedRectangleEls();
    [fixedEls.length, fixedEls.width].forEach(input => {
      if (!input) return;
      input.addEventListener('input', () => {
        if (isFixedRectangleMode()) markFixedRectangleValidity();
        else clearFixedRectangleValidation();
      });
      input.addEventListener('change', () => {
        restartRectangleToolIfActive({ force: false });
      });
      input.addEventListener('blur', () => {
        restartRectangleToolIfActive({ force: false });
      });
      input.addEventListener('keydown', event => event.stopPropagation());
    });
    if (fixedEls.checkbox) {
      fixedEls.checkbox.addEventListener('change', () => {
        if (!fixedEls.checkbox.checked) {
          clearFixedRectangleValidation();
        }
        if (isRectangleToolActive()) {
          restartRectangleToolIfActive({ force: true, focusInvalid: fixedEls.checkbox.checked });
        } else if (!fixedEls.checkbox.checked) {
          cancelFixedRectanglePlacement(true);
        }
      });
    }

  }).catch(err => {
    console.error('[tools-draw] Failed to initialize after runtime ready:', err);
  });
}
