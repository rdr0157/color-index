// tools-structures.js — proposed/existing structure tools
// Loaded after runtime.js. Adds structure-specific rectangle tools to the
// "Structures" sidebar section. These follow the same rectangle pattern as
// tools-draw.js, with different symbology and independent fixed-size controls.

if (!window.SitePlanRuntimeReady) {
  console.error('[tools-structures] window.SitePlanRuntimeReady is missing. ' +
    'Make sure js/runtime.js is loaded before js/tools-structures.js.');
} else {
  window.SitePlanRuntimeReady.then(RT => {

    const STRUCTURE_TOOLS = {
      proposed: {
        id: 'proposed',
        buttonId: 'btn-proposed-structure',
        checkboxId: 'chk-proposed-structure-fixed',
        lengthId: 'proposed-structure-l',
        widthId: 'proposed-structure-w',
        label: 'Proposed structure',
        title: 'Draw a proposed structure',
        sitePlanTool: 'proposedStructure',
        status: 'proposed',
        symbol: {
          type: 'simple-fill',
          color: [200, 0, 0, 0.12],
          outline: { type: 'simple-line', color: [200, 0, 0, 1], width: 2.5 }
        },
        icon:
          '<svg viewBox="0 0 28 18" aria-hidden="true">' +
            '<rect x="5" y="4" width="18" height="10" rx="1" ' +
            'fill="rgba(200,0,0,0.12)" stroke="rgb(200,0,0)" stroke-width="2.3"></rect>' +
          '</svg>'
      },
      existing: {
        id: 'existing',
        buttonId: 'btn-existing-structure',
        checkboxId: 'chk-existing-structure-fixed',
        lengthId: 'existing-structure-l',
        widthId: 'existing-structure-w',
        label: 'Existing structure',
        title: 'Draw an existing structure',
        sitePlanTool: 'existingStructure',
        status: 'existing',
        symbol: {
          type: 'simple-fill',
          color: [0, 0, 0, 0.04],
          outline: { type: 'simple-line', color: [60, 60, 60, 1], width: 2, style: 'dash' }
        },
        icon:
          '<svg viewBox="0 0 28 18" aria-hidden="true">' +
            '<rect x="5" y="4" width="18" height="10" rx="1" ' +
            'fill="rgba(0,0,0,0.04)" stroke="rgb(60,60,60)" stroke-width="2" stroke-dasharray="4 3"></rect>' +
          '</svg>'
      }
    };

    let pendingStructureTool = null;
    let activeStructureTool = null;
    let ignoreNextSketchCancel = false;
    let fixedStructureClickHandle = null;
    let fixedStructureEscHandler = null;
    let fixedStructureToolKey = null;
    let lastSettingsSignature = null;

    const MIN_RECT_SIDE_FT = 2;
    const MIN_RECT_AREA_SQFT = 4;
    const DEFAULT_RECT_SIDE_FT = 10;

    function announceToolActivated(toolKey) {
      try {
        window.dispatchEvent(new CustomEvent('siteplan:tool-activated', {
          detail: { source: 'tools-structures', tool: toolKey || null }
        }));
      } catch (err) {}
    }

    window.addEventListener('siteplan:tool-activated', event => {
      const detail = event && event.detail ? event.detail : {};
      if (detail.source === 'tools-structures') return;
      cancelFixedStructurePlacement(false);
      clearActiveStructureButton();
      clearAllStructureValidation();
      pendingStructureTool = null;
      window.__sitePlanPendingToolType = null;
    });

    function toolForKey(toolKey) {
      return STRUCTURE_TOOLS[toolKey] || null;
    }

    function structureEls(toolKey) {
      const tool = toolForKey(toolKey);
      return tool ? {
        checkbox: document.getElementById(tool.checkboxId),
        length: document.getElementById(tool.lengthId),
        width: document.getElementById(tool.widthId)
      } : { checkbox: null, length: null, width: null };
    }

    function isFixedStructureMode(toolKey) {
      const els = structureEls(toolKey);
      return !!(els.checkbox && els.checkbox.checked);
    }

    function structureDimensions(toolKey) {
      const els = structureEls(toolKey);
      const lengthFt = els.length ? Number.parseFloat(els.length.value) : NaN;
      const widthFt = els.width ? Number.parseFloat(els.width.value) : NaN;
      return {
        lengthFt,
        widthFt,
        valid: Number.isFinite(lengthFt) && lengthFt >= 1 &&
               Number.isFinite(widthFt) && widthFt >= 1
      };
    }

    function markStructureValidity(toolKey) {
      const els = structureEls(toolKey);
      const dims = structureDimensions(toolKey);
      const lengthValid = Number.isFinite(dims.lengthFt) && dims.lengthFt >= 1;
      const widthValid = Number.isFinite(dims.widthFt) && dims.widthFt >= 1;
      if (els.length) els.length.classList.toggle('invalid', !lengthValid);
      if (els.width) els.width.classList.toggle('invalid', !widthValid);
      return dims.valid;
    }

    function clearStructureValidation(toolKey) {
      const els = structureEls(toolKey);
      if (els.length) els.length.classList.remove('invalid');
      if (els.width) els.width.classList.remove('invalid');
    }

    function clearAllStructureValidation() {
      Object.keys(STRUCTURE_TOOLS).forEach(clearStructureValidation);
    }

    function focusFirstInvalidInput(toolKey) {
      const els = structureEls(toolKey);
      const dims = structureDimensions(toolKey);
      const lengthValid = Number.isFinite(dims.lengthFt) && dims.lengthFt >= 1;
      if (!lengthValid && els.length) { els.length.focus(); return; }
      if (els.width) els.width.focus();
    }

    function setActiveStructureButton(toolKey) {
      activeStructureTool = toolKey || null;
      document.querySelectorAll('.draw-tool-btn.icon-btn').forEach(btn => {
        btn.classList.remove('active');
      });
      const tool = toolForKey(toolKey);
      if (tool) {
        const btn = document.getElementById(tool.buttonId);
        if (btn) btn.classList.add('active');
      }
    }

    function clearActiveStructureButton() {
      setActiveStructureButton(null);
    }

    function isStructureToolActive(toolKey) {
      return !!activeStructureTool && (!toolKey || activeStructureTool === toolKey);
    }

    function cancelFixedStructurePlacement(clearButtonState) {
      if (fixedStructureClickHandle) {
        try { fixedStructureClickHandle.remove(); } catch (err) {}
        fixedStructureClickHandle = null;
      }
      if (fixedStructureEscHandler) {
        document.removeEventListener('keydown', fixedStructureEscHandler, true);
        fixedStructureEscHandler = null;
      }
      fixedStructureToolKey = null;
      if (clearButtonState) clearActiveStructureButton();
    }

    function cancelActiveSketchForStructureRestart() {
      if (RT.sketch && RT.sketch.state === 'active') {
        ignoreNextSketchCancel = true;
        try { RT.sketch.cancel(); }
        catch (err) { ignoreNextSketchCancel = false; }
      }
    }

    function webMercatorLatRadiansFromY(y) {
      const radius = 6378137;
      return (2 * Math.atan(Math.exp(y / radius))) - (Math.PI / 2);
    }

    function feetToLocalMapUnits(feet, center, spatialReference) {
      const meters = feet * 0.3048;
      const wkid = spatialReference && (spatialReference.wkid || spatialReference.latestWkid);
      if (wkid === 3857 || wkid === 102100 || wkid === 102113) {
        const latRad = webMercatorLatRadiansFromY(center.y);
        const cosLat = Math.max(Math.abs(Math.cos(latRad)), 0.2);
        return meters / cosLat;
      }
      if (wkid === 4326 || (spatialReference && spatialReference.isGeographic)) {
        const latRad = (center.y || 0) * Math.PI / 180;
        const feetPerDegreeLat = 364000;
        const feetPerDegreeLon = Math.max(feetPerDegreeLat * Math.cos(latRad), 1);
        return { dx: feet / feetPerDegreeLon, dy: feet / feetPerDegreeLat };
      }
      return meters;
    }

    function makeRectangleGeometryFromCenter(center, lengthFt, widthFt) {
      if (!center) return null;
      const sr = center.spatialReference || (RT.view && RT.view.spatialReference);
      const lengthUnits = feetToLocalMapUnits(lengthFt, center, sr);
      const widthUnits = feetToLocalMapUnits(widthFt, center, sr);
      const halfX = (typeof lengthUnits === 'object' ? lengthUnits.dx : lengthUnits) / 2;
      const halfY = (typeof widthUnits === 'object' ? widthUnits.dy : widthUnits) / 2;
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

    function ringWithoutDuplicateClose(geometry) {
      if (!geometry || geometry.type !== 'polygon' || !geometry.rings || !geometry.rings.length) return [];
      const ring = geometry.rings[0] || [];
      if (ring.length > 2) {
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first && last && first[0] === last[0] && first[1] === last[1]) return ring.slice(0, -1);
      }
      return ring.slice();
    }

    function segmentLengthFt(a, b, spatialReference) {
      if (!a || !b) return 0;
      const segment = { type: 'polyline', paths: [[a, b]], spatialReference };
      let length = 0;
      try { length = Math.abs(RT.geometryEngine.geodesicLength(segment, 'feet') || 0); } catch (err) {}
      if (!Number.isFinite(length) || length <= 0) {
        try { length = Math.abs(RT.geometryEngine.planarLength(segment, 'feet') || 0); } catch (err) {}
      }
      return Number.isFinite(length) ? length : 0;
    }

    function polygonAreaSqFt(geometry) {
      let area = 0;
      try { area = Math.abs(RT.geometryEngine.geodesicArea(geometry, 'square-feet') || 0); } catch (err) {}
      if (!Number.isFinite(area) || area <= 0) {
        try { area = Math.abs(RT.geometryEngine.planarArea(geometry, 'square-feet') || 0); } catch (err) {}
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

    function makeDefaultRectangleGeometry(sourceGeometry) {
      const center = sourceGeometry && sourceGeometry.extent && sourceGeometry.extent.center;
      if (!center) return null;
      const sr = sourceGeometry.spatialReference || (center && center.spatialReference);
      const units = feetToLocalMapUnits(DEFAULT_RECT_SIDE_FT, center, sr);
      const halfX = (typeof units === 'object' ? units.dx : units) / 2;
      const halfY = (typeof units === 'object' ? units.dy : units) / 2;
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
      const reselect = () => {
        try { RT.selectGraphic(graphic); }
        catch (err) { console.warn('[tools-structures] Unable to reselect default structure rectangle.', err); }
      };
      if (window.requestAnimationFrame) window.requestAnimationFrame(reselect);
      else setTimeout(reselect, 0);
      return true;
    }

    function placeFixedStructureAt(toolKey, mapPoint) {
      const tool = toolForKey(toolKey);
      if (!tool) return;
      const dims = structureDimensions(toolKey);
      if (!dims.valid) {
        markStructureValidity(toolKey);
        focusFirstInvalidInput(toolKey);
        return;
      }
      const geometry = makeRectangleGeometryFromCenter(mapPoint, dims.lengthFt, dims.widthFt);
      if (!geometry) return;

      const graphic = new RT.Graphic({
        geometry,
        symbol: tool.symbol,
        attributes: {
          sitePlanTool: tool.sitePlanTool,
          sitePlanCategory: 'structure',
          structureStatus: tool.status,
          fixedSize: true,
          fixedLengthFt: dims.lengthFt,
          fixedWidthFt: dims.widthFt,
          useFixedSizeLabels: true
        }
      });
      graphic.__toolType = 'rectangle';
      graphic.__structureStatus = tool.status;
      graphic.__fixedSize = true;
      graphic.__fixedLengthFt = dims.lengthFt;
      graphic.__fixedWidthFt = dims.widthFt;
      graphic.__useFixedSizeLabels = true;

      cancelFixedStructurePlacement(false);
      clearActiveStructureButton();
      RT.registerDrawableGraphic(graphic);
      if (typeof RT.refreshSideLabelsForGraphic === 'function') RT.refreshSideLabelsForGraphic(graphic);

      const reselect = () => {
        try { RT.selectGraphic(graphic); }
        catch (err) { console.warn('[tools-structures] Unable to select fixed structure.', err); }
      };
      if (window.requestAnimationFrame) window.requestAnimationFrame(reselect);
      else setTimeout(reselect, 0);
    }

    function startFixedStructurePlacement(toolKey) {
      announceToolActivated(toolKey);
      if (!markStructureValidity(toolKey)) {
        cancelFixedStructurePlacement(false);
        setActiveStructureButton(toolKey);
        focusFirstInvalidInput(toolKey);
        return;
      }

      clearStructureValidation(toolKey);
      cancelFixedStructurePlacement(false);
      pendingStructureTool = null;
      window.__sitePlanPendingToolType = null;
      RT.clearSelection();
      cancelActiveSketchForStructureRestart();
      setActiveStructureButton(toolKey);
      fixedStructureToolKey = toolKey;

      fixedStructureClickHandle = RT.view.on('click', event => {
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        placeFixedStructureAt(toolKey, event.mapPoint);
      });

      fixedStructureEscHandler = function (event) {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          cancelFixedStructurePlacement(true);
        }
      };
      document.addEventListener('keydown', fixedStructureEscHandler, true);
    }

    function beginStructureDraw(toolKey) {
      const tool = toolForKey(toolKey);
      if (!tool) return;
      announceToolActivated(toolKey);
      clearAllStructureValidation();
      cancelFixedStructurePlacement(false);
      pendingStructureTool = toolKey;
      window.__sitePlanPendingToolType = 'rectangle';

      RT.clearSelection();
      cancelActiveSketchForStructureRestart();
      setActiveStructureButton(toolKey);
      RT.sketch.viewModel.polygonSymbol = tool.symbol;

      try {
        RT.sketch.create('rectangle');
      } catch (err) {
        clearActiveStructureButton();
        pendingStructureTool = null;
        window.__sitePlanPendingToolType = null;
        console.error('[tools-structures] ' + toolKey + ' create failed:', err);
      }
    }

    function startStructureTool(toolKey) {
      lastSettingsSignature = structureSettingsSignature(toolKey);
      if (isFixedStructureMode(toolKey)) {
        startFixedStructurePlacement(toolKey);
        return;
      }
      beginStructureDraw(toolKey);
    }

    function structureSettingsSignature(toolKey) {
      const dims = structureDimensions(toolKey);
      return [
        toolKey || '',
        isFixedStructureMode(toolKey) ? 'fixed' : 'manual',
        Number.isFinite(dims.lengthFt) ? dims.lengthFt : '',
        Number.isFinite(dims.widthFt) ? dims.widthFt : '',
        dims.valid ? 'valid' : 'invalid'
      ].join('|');
    }

    function restartStructureToolIfActive(toolKey, options) {
      if (!isStructureToolActive(toolKey)) return;
      const opts = options || {};
      const signature = structureSettingsSignature(toolKey);
      if (!opts.force && signature === lastSettingsSignature) return;
      lastSettingsSignature = signature;

      cancelFixedStructurePlacement(false);
      cancelActiveSketchForStructureRestart();
      pendingStructureTool = null;
      window.__sitePlanPendingToolType = null;
      setActiveStructureButton(toolKey);

      if (isFixedStructureMode(toolKey)) {
        const valid = markStructureValidity(toolKey);
        if (!valid) {
          if (opts.focusInvalid) focusFirstInvalidInput(toolKey);
          return;
        }
        startFixedStructurePlacement(toolKey);
        return;
      }

      beginStructureDraw(toolKey);
    }

    RT.sketch.on('create', event => {
      if (event.state === 'cancel') {
        if (ignoreNextSketchCancel) {
          ignoreNextSketchCancel = false;
          return;
        }
        if (activeStructureTool || pendingStructureTool) clearActiveStructureButton();
        pendingStructureTool = null;
        if (window.__sitePlanPendingToolType === 'rectangle') window.__sitePlanPendingToolType = null;
        return;
      }

      if (event.state === 'complete') {
        if (activeStructureTool || pendingStructureTool) clearActiveStructureButton();
      }
    });

    RT.onGraphicCreated(graphic => {
      if (!pendingStructureTool) return;
      const tool = toolForKey(pendingStructureTool);
      if (!tool) return;
      graphic.__toolType = 'rectangle';
      graphic.__structureStatus = tool.status;
      graphic.symbol = tool.symbol;
      graphic.attributes = Object.assign({}, graphic.attributes || {}, {
        sitePlanTool: tool.sitePlanTool,
        sitePlanCategory: 'structure',
        structureStatus: tool.status
      });

      replaceInvalidRectangleIfNeeded(graphic);

      pendingStructureTool = null;
      window.__sitePlanPendingToolType = null;
    });

    function buildToolButton(tool) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = tool.buttonId;
      btn.className = 'tool-btn draw-tool-btn icon-btn';
      btn.title = tool.title || tool.label;
      btn.innerHTML = '<span class="tool-icon">' + tool.icon + '</span>' +
                      '<span class="tool-label">' + tool.label + '</span>';
      btn.addEventListener('click', () => startStructureTool(tool.id));
      return btn;
    }

    function buildFixedSizeRow(tool) {
      const row = document.createElement('div');
      row.className = 'size-row';
      row.innerHTML =
        '<input type="checkbox" id="' + tool.checkboxId + '">' +
        '<label for="' + tool.checkboxId + '" class="size-lbl">Fixed size</label>' +
        '<input id="' + tool.lengthId + '" type="number" min="1" step="1" placeholder="L" class="dim-input" aria-label="' + tool.label + ' length in feet">' +
        '<span class="dim-sep">×</span>' +
        '<input id="' + tool.widthId + '" type="number" min="1" step="1" placeholder="W" class="dim-input" aria-label="' + tool.label + ' width in feet">' +
        '<span class="dim-sep">ft</span>';
      return row;
    }

    const section = document.getElementById('tools-structures');
    if (!section) {
      console.warn('[tools-structures] Sidebar section #tools-structures not found.');
      return;
    }

    Object.keys(STRUCTURE_TOOLS).forEach(toolKey => {
      const tool = STRUCTURE_TOOLS[toolKey];
      section.appendChild(buildToolButton(tool));
      section.appendChild(buildFixedSizeRow(tool));
    });

    Object.keys(STRUCTURE_TOOLS).forEach(toolKey => {
      const els = structureEls(toolKey);
      [els.length, els.width].forEach(input => {
        if (!input) return;
        input.addEventListener('input', () => {
          if (isFixedStructureMode(toolKey)) markStructureValidity(toolKey);
          else clearStructureValidation(toolKey);
        });
        input.addEventListener('change', () => restartStructureToolIfActive(toolKey, { force: false }));
        input.addEventListener('blur', () => restartStructureToolIfActive(toolKey, { force: false }));
        input.addEventListener('keydown', event => event.stopPropagation());
      });

      if (els.checkbox) {
        els.checkbox.addEventListener('change', () => {
          if (!els.checkbox.checked) clearStructureValidation(toolKey);
          if (isStructureToolActive(toolKey)) {
            restartStructureToolIfActive(toolKey, { force: true, focusInvalid: els.checkbox.checked });
          } else if (!els.checkbox.checked && fixedStructureToolKey === toolKey) {
            cancelFixedStructurePlacement(true);
          }
        });
      }
    });

  }).catch(err => {
    console.error('[tools-structures] Failed to initialize after runtime ready:', err);
  });
}
