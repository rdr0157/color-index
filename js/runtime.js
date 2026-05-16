// Site Plan Builder — runtime.js
// Pairs with: config.js, css/styles.css, index.html
// Load order: config.js → ArcGIS API → runtime.js
//
// Exposes window.SitePlanRuntime — the API tool files build on.
// See README for tool-file conventions.

(function () {
  const params = new URLSearchParams(window.location.search);
  const geoParam = (params.get('geo') || '').trim();

  function setStatus(msg, ok) {
    // Shell V003: visible status bar removed.
    // This no-op keeps existing map/search/layer calls safe until a future tool-specific message system is added.
  }
  window.setStatus = setStatus;
  function fmt(value, fallback) {
    const s = value == null ? '' : String(value).trim();
    return s && s !== '0' && s.toLowerCase() !== 'null' ? s : (fallback || '—');
  }

  function escapeSql(value) {
    return String(value).replace(/'/g, "''");
  }

  // Public ready-promise so tool files can wait for the runtime to be ready
  // before reading window.SitePlanRuntime. Tool files should use:
  //
  //   window.SitePlanRuntimeReady.then(RT => { ... tool code ... });
  //
  // This avoids race conditions where a tool's <script> tag runs synchronously
  // after runtime.js but before the ArcGIS require() callback has finished
  // populating window.SitePlanRuntime. Both window.SitePlanRuntime and the
  // 'siteplan:ready' event are also dispatched on resolution.
  let resolveRuntimeReady;
  window.SitePlanRuntimeReady = new Promise(resolve => {
    resolveRuntimeReady = resolve;
  });

  require([
    'esri/Map', 'esri/views/MapView',
    'esri/layers/FeatureLayer', 'esri/layers/GraphicsLayer',
    'esri/Graphic', 'esri/widgets/Home', 'esri/widgets/ScaleBar',
    'esri/widgets/Search', 'esri/widgets/Attribution', 'esri/widgets/Sketch', 'esri/geometry/geometryEngine', 'esri/Viewpoint'
  ], function (
    EsriMap, MapView,
    FeatureLayer, GraphicsLayer,
    Graphic, Home, ScaleBar,
    Search, Attribution, Sketch, geometryEngine, Viewpoint
  ) {
    const cfg = window.SitePlanConfig;
    if (!cfg || !cfg.layers || !cfg.layers.parcels) {
      setStatus('Config failed.', false);
      return;
    }

    const pf = cfg.layers.parcels.popupFields || {};
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });

    const agencyEl = document.getElementById('agency');
    agencyEl.innerHTML = '';
    const line1 = document.createElement('div'); line1.textContent = cfg.branding?.countyName || 'Walla Walla County';
    const line2 = document.createElement('div'); line2.textContent = cfg.branding?.agencyName || 'Community Development';
    agencyEl.appendChild(line1); agencyEl.appendChild(line2);
    document.getElementById('title').textContent = (cfg.branding?.toolTitle || 'Site Plan Builder') + ' · Generated · ' + dateStr;
    if (cfg.branding?.sealUrl) document.getElementById('seal-img').src = cfg.branding.sealUrl;

    let selectedParcelGeometry = null;
    let currentParcelAttrs = null;
    let activeBasemapId = cfg.map?.basemap || 'gray-vector';
    let nativeAttribution = '';
    let parcelSearch = null;

    const parcelLayer = new FeatureLayer({
      url: cfg.layers.parcels.url,
      outFields: cfg.layers.parcels.outFields || ['*'],
      popupEnabled: false,
      renderer: {
        type: 'simple',
        symbol: {
          type: 'simple-fill',
          color: [0,0,0,0],
          outline: { type:'simple-line', color:[26,58,107,0.85], width:1.5 }
        }
      }
    });

    const contourLayer = new FeatureLayer({
      url:'https://services8.arcgis.com/COL6rRPkF9w28VGX/arcgis/rest/services/Contours_10ft/FeatureServer/0',
      title:'Contours', visible:false, popupEnabled:false, listMode:'hide',
      renderer:{ type:'simple', symbol:{ type:'simple-line', color:[120,95,65,0.72], width:0.8 } }
    });

    const liquefactionLayer = new FeatureLayer({
      url:'https://services8.arcgis.com/COL6rRPkF9w28VGX/arcgis/rest/services/Liquefaction_Susceptibility/FeatureServer/0',
      title:'Liquefaction Susceptibility', visible:false, popupEnabled:false, listMode:'hide', opacity:1,
      definitionExpression:"LIQUEFAC_1 IN ('Moderate to High', 'High')",
      renderer:{ type:'simple', symbol:{ type:'simple-fill', style:'backward-diagonal', color:[214,83,32,0.55], outline:{ type:'simple-line', color:[174,63,25,0.9], width:0.9 } } }
    });

    const riparianWaterBodyLayer = new FeatureLayer({
      url:'https://services8.arcgis.com/COL6rRPkF9w28VGX/arcgis/rest/services/Minimum_Watercourse_and_Water_Body_Riparian_Buffers/FeatureServer/0',
      title:'Riparian Buffer — Water Bodies', visible:false, popupEnabled:false, listMode:'hide', opacity:1,
      renderer:{ type:'simple', symbol:{ type:'simple-fill', color:[37,150,190,0.16], outline:{ type:'simple-line', color:[0,95,130,0.85], width:0.8 } } }
    });

    const riparianWatercourseLayer = new FeatureLayer({
      url:'https://services8.arcgis.com/COL6rRPkF9w28VGX/arcgis/rest/services/Minimum_Watercourse_and_Water_Body_Riparian_Buffers/FeatureServer/1',
      title:'Riparian Buffer — Watercourses', visible:false, popupEnabled:false, listMode:'hide', opacity:1,
      renderer:{ type:'simple', symbol:{ type:'simple-fill', color:[37,150,190,0.16], outline:{ type:'simple-line', color:[0,95,130,0.85], width:0.8 } } }
    });

    const wetlandsLayer = new FeatureLayer({
      url:'https://services8.arcgis.com/COL6rRPkF9w28VGX/arcgis/rest/services/Wetlands/FeatureServer/0',
      title:'Wetlands', visible:false, popupEnabled:false, listMode:'hide', opacity:1,
      renderer:{ type:'simple', symbol:{ type:'simple-fill', color:[36,166,108,0.18], outline:{ type:'simple-line', color:[0,111,68,0.9], width:0.9 } } }
    });

    const caraLayer = new FeatureLayer({
      url:'https://services8.arcgis.com/COL6rRPkF9w28VGX/arcgis/rest/services/Aquifer_Vulnerability/FeatureServer/0',
      title:'Critical Aquifer Recharge Area (CARA)', visible:false, popupEnabled:false, listMode:'hide', opacity:1,
      renderer:{
        type:'unique-value', field:'aqvul_zone',
        defaultSymbol:{ type:'simple-fill', style:'none', outline:{ type:'simple-line', color:[120,120,120,0.45], width:0.6 } },
        uniqueValueInfos:[
          { value:'Zone I', label:'CARA High Recharge Vulnerability', symbol:{ type:'simple-fill', style:'backward-diagonal', color:[255,0,0,0.62], outline:{ type:'simple-line', color:[230,0,0,0.9], width:0.8 } } },
          { value:'Zone II', label:'CARA Moderate Recharge Vulnerability', symbol:{ type:'simple-fill', style:'backward-diagonal', color:[255,170,0,0.62], outline:{ type:'simple-line', color:[255,170,0,0.9], width:0.8 } } }
        ]
      }
    });

    const floodLayer = new FeatureLayer({
      url:'https://services8.arcgis.com/COL6rRPkF9w28VGX/arcgis/rest/services/FEMA/FeatureServer/0',
      title:'Flood Hazard Areas', visible:false, popupEnabled:false, listMode:'hide', opacity:1,
      definitionExpression:"zone IN ('A', 'AE', 'AO')",
      renderer:{ type:'simple', symbol:{ type:'simple-fill', color:[0,105,180,0.16], outline:{ type:'simple-line', color:[0,75,150,0.9], width:0.9 } } }
    });

    const highlightLayer = new GraphicsLayer({ title:'Selected Parcel', listMode:'hide' });
    const drawLayer = new GraphicsLayer({ title:'Site Plan Drawings', listMode:'hide' });
    const labelLayer = new GraphicsLayer({ title:'Site Plan Labels', listMode:'hide' });
    const measureLayer = new GraphicsLayer({ title:'Temporary Measurements', listMode:'hide' });
    const previewLayer = new GraphicsLayer({ title:'Drawing / Measurement Preview', listMode:'hide' });

    const referenceLayerGroups = {
      contours: [contourLayer],
      liquefaction: [liquefactionLayer],
      riparian: [riparianWaterBodyLayer, riparianWatercourseLayer],
      wetlands: [wetlandsLayer],
      cara: [caraLayer],
      flood: [floodLayer]
    };
    const referenceLayerLabels = {
      contours: 'Contours', liquefaction: 'Liquefaction Susceptibility', riparian: 'Riparian Buffer',
      wetlands: 'Wetlands', cara: 'Critical Aquifer Recharge Area (CARA)', flood: 'Flood Hazard Areas'
    };
    const layerCreditLabels = {
      contours: 'Washington State DNR (Contours)',
      wetlands: 'US FWS National Wetlands Inventory (NWI)',
      flood: 'FEMA Flood Hazard Areas'
    };

    const map = new EsriMap({
      basemap: activeBasemapId,
      layers: [
        floodLayer, liquefactionLayer, caraLayer, wetlandsLayer,
        riparianWaterBodyLayer, riparianWatercourseLayer, contourLayer,
        parcelLayer, highlightLayer, drawLayer, labelLayer, measureLayer, previewLayer
      ]
    });

    const view = new MapView({
      container:'viewDiv',
      map,
      center: cfg.map?.center || [-118.26, 46.14],
      zoom: 12,
      constraints:{ snapToZoom:false },
      ui:{ components:['zoom'] }
    });

    const home = new Home({ view });
    view.ui.add(home, 'top-left');

    const scaleBar = new ScaleBar({ view, unit:'dual' });
    view.ui.add(scaleBar, { position:'bottom-left', index:0 });


    // ── Core editing / selection infrastructure ───────────────────────────
    // Future tool files should add graphics to drawLayer through SitePlanRuntime.
    const sketch = new Sketch({
      view,
      layer: drawLayer,
      updateOnGraphicClick: true,
      creationMode: 'update',
      defaultUpdateOptions: {
        tool: 'transform',
        enableRotation: true,
        enableScaling: true,
        preserveAspectRatio: false,
        toggleToolOnClick: false
      },
      snappingOptions: { enabled: true, selfEnabled: true, featureEnabled: true, featureSources: [] }
    });

    const measureSketch = new Sketch({
      view,
      layer: measureLayer,
      updateOnGraphicClick: false,
      creationMode: 'single',
      snappingOptions: { enabled: true, selfEnabled: true, featureEnabled: true, featureSources: [] }
    });

    let selectedEditMode = 'reshape';
    let selectedGraphic = null;
    let sitePlanGraphicCounter = 1;

    function assignGraphicId(graphic) {
      if (graphic && !graphic.__sitePlanId) graphic.__sitePlanId = 'spg-' + (sitePlanGraphicCounter++);
      return graphic;
    }

    function refreshSnapSources() {
      const sources = [
        { layer: drawLayer, enabled: true },
        { layer: parcelLayer, enabled: true },
        { layer: highlightLayer, enabled: true }
      ];
      sketch.snappingOptions.featureSources = sources;
      measureSketch.snappingOptions.featureSources = sources;
    }
    refreshSnapSources();

    function updateEditModeButtons() {
      const reshape = document.getElementById('edit-mode-reshape');
      const resize = document.getElementById('edit-mode-resize');
      if (reshape) {
        reshape.classList.toggle('active', selectedEditMode === 'reshape');
        reshape.setAttribute('aria-pressed', selectedEditMode === 'reshape' ? 'true' : 'false');
      }
      if (resize) {
        resize.classList.toggle('active', selectedEditMode === 'resize');
        resize.setAttribute('aria-pressed', selectedEditMode === 'resize' ? 'true' : 'false');
      }
    }

    function isSelectableGraphic(graphic) {
      return !!(graphic && graphic.layer === drawLayer && !graphic.__nonSelectable);
    }

    function getGraphicAnchorPoint(graphic) {
      if (!graphic || !graphic.geometry) return null;
      if (graphic.geometry.type === 'point') return graphic.geometry;
      return graphic.geometry.extent ? graphic.geometry.extent.center : null;
    }

    function toolbarElement() { return document.getElementById('selection-toolbar'); }

    function getGraphicTopScreenY(graphic) {
      // Sample several vertices of the graphic and return the minimum screen-Y
      // (i.e. the topmost screen position). This gives a reliable anchor for
      // positioning the floating toolbar above the rotate handle regardless of
      // map rotation. For points, just return the screen Y.
      if (!graphic || !graphic.geometry) return null;
      const geom = graphic.geometry;
      const candidates = [];
      if (geom.type === 'point') {
        candidates.push(geom);
      } else if (geom.type === 'polygon' && geom.rings && geom.rings.length) {
        const ring = geom.rings[0];
        const sr = geom.spatialReference;
        // Sample up to 16 vertices to keep this fast on detailed polygons.
        const step = Math.max(1, Math.floor(ring.length / 16));
        for (let i = 0; i < ring.length; i += step) {
          candidates.push(pointFromXY(ring[i][0], ring[i][1], sr));
        }
      } else if (geom.type === 'polyline' && geom.paths && geom.paths.length) {
        geom.paths.forEach(path => {
          path.forEach(pt => candidates.push(pointFromXY(pt[0], pt[1], geom.spatialReference)));
        });
      } else if (geom.extent) {
        const e = geom.extent;
        candidates.push(pointFromXY(e.xmin, e.ymax, e.spatialReference));
        candidates.push(pointFromXY(e.xmax, e.ymax, e.spatialReference));
        candidates.push(pointFromXY(e.xmin, e.ymin, e.spatialReference));
        candidates.push(pointFromXY(e.xmax, e.ymin, e.spatialReference));
      }
      let minY = Infinity, anchorX = 0;
      candidates.forEach(pt => {
        const s = view.toScreen(pt);
        if (s && Number.isFinite(s.y) && s.y < minY) { minY = s.y; anchorX = s.x; }
      });
      if (!Number.isFinite(minY)) return null;
      return { x: anchorX, y: minY };
    }

    function getGraphicCenterScreen(graphic) {
      const anchor = getGraphicAnchorPoint(graphic);
      if (!anchor) return null;
      const s = view.toScreen(anchor);
      return (s && Number.isFinite(s.x)) ? s : null;
    }

    function positionSelectionToolbar() {
      const toolbar = toolbarElement();
      if (!toolbar || !selectedGraphic) return;
      const top = getGraphicTopScreenY(selectedGraphic);
      const center = getGraphicCenterScreen(selectedGraphic);
      if (!top || !center) return;
      // Target Y: above the topmost vertex by enough pixels to clear the
      // sketch rotate handle (~30px above the shape) plus the toolbar height
      // and a small margin.
      const ROTATE_HANDLE_CLEARANCE = 56;
      const viewport = view.container ? view.container.getBoundingClientRect() : { width: 0, height: 0 };
      let targetX = center.x;
      let targetY = top.y - ROTATE_HANDLE_CLEARANCE;
      // Clamp within the visible map area so the toolbar never disappears
      // off-screen. We can only estimate the toolbar size after layout, so
      // measure it on the fly.
      const toolbarRect = toolbar.getBoundingClientRect();
      const halfW = (toolbarRect.width || 160) / 2;
      const fullH = toolbarRect.height || 36;
      const PAD = 6;
      if (targetX - halfW < PAD) targetX = halfW + PAD;
      if (targetX + halfW > viewport.width - PAD) targetX = viewport.width - halfW - PAD;
      if (targetY < PAD) targetY = PAD + fullH; // flip below when above is off-screen
      if (targetY > viewport.height - PAD) targetY = viewport.height - PAD;
      toolbar.style.left = Math.round(targetX) + 'px';
      toolbar.style.top = Math.round(targetY) + 'px';
      toolbar.style.transform = 'translate(-50%, -100%)';
    }

    function showSelectionToolbar(graphic) {
      selectedGraphic = graphic || selectedGraphic;
      const toolbar = toolbarElement();
      if (!toolbar || !selectedGraphic) return;
      // Exiting label-edit mode when selection changes
      toolbar.classList.remove('editing-label');
      toolbar.classList.add('visible');
      updateSelectedShapeBox();
      requestAnimationFrame(positionSelectionToolbar);
    }

    function hideSelectionToolbar() {
      const toolbar = toolbarElement();
      if (toolbar) {
        toolbar.classList.remove('visible');
        toolbar.classList.remove('editing-label');
      }
      selectedGraphic = null;
      updateSelectedShapeBox();
    }

    // ── Selected-shape measurement box (above the scale bar) ───────────────
    function selectedShapeBoxEl() { return document.getElementById('selected-shape-box'); }

    function updateSelectedShapeBox() {
      const box = selectedShapeBoxEl();
      if (!box) return;
      const g = selectedGraphic;
      const show = !!(g && g.geometry && g.geometry.type === 'polygon');
      if (!show) {
        box.classList.remove('visible');
        box.setAttribute('aria-hidden', 'true');
        return;
      }
      const sqFt = geometryAreaSqFt(g.geometry);
      const valueEl = document.getElementById('ssb-value');
      if (valueEl) {
        if (!Number.isFinite(sqFt) || sqFt <= 0) {
          valueEl.textContent = '—';
        } else {
          valueEl.textContent = numberWithCommas(sqFt, 0) + ' sq ft / ' +
                                numberWithCommas(sqFt / 43560, 2) + ' ac';
        }
      }
      box.classList.add('visible');
      box.setAttribute('aria-hidden', 'false');
    }

    function sketchUpdateOptionsForGraphic(graphic) {
      const type = graphic && graphic.geometry && graphic.geometry.type;
      // If no graphic is available yet, still honor the visible edit-mode
      // button for Sketch's automatic create/update and graphic-click handoff.
      // Current editable tools are polygon-based; point tools can still be
      // forced into transform mode through explicit selectGraphic/startSketchUpdate.
      const useReshape = selectedEditMode === 'reshape' && (!type || type === 'polygon' || type === 'polyline');
      return useReshape
        ? { tool: 'reshape', toggleToolOnClick: false }
        : { tool: 'transform', enableRotation: true, enableScaling: true, preserveAspectRatio: false, toggleToolOnClick: false };
    }

    function syncSketchDefaultUpdateOptions(graphic) {
      // Sketch can automatically enter update mode immediately after creation
      // or when updateOnGraphicClick handles a graphic click. Keep its default
      // update tool synchronized with the visible Reshape/Resize button state
      // so the UI and actual edit handles do not diverge.
      try {
        sketch.defaultUpdateOptions = sketchUpdateOptionsForGraphic(graphic || selectedGraphic);
      } catch (err) {}
    }

    function startSketchUpdate(graphic) {
      if (!graphic || !graphic.geometry) return;
      assignGraphicId(graphic);
      const options = sketchUpdateOptionsForGraphic(graphic);
      syncSketchDefaultUpdateOptions(graphic);
      try { sketch.update([graphic], options); }
      catch (err) { console.warn('Unable to start edit session for selected graphic.', err); }
    }

    function selectGraphic(graphic) {
      if (!isSelectableGraphic(graphic)) return false;
      selectedGraphic = assignGraphicId(graphic);
      startSketchUpdate(selectedGraphic);
      showSelectionToolbar(selectedGraphic);
      return true;
    }

    function clearSelection() {
      try { if (sketch && sketch.state !== 'idle') sketch.cancel(); } catch (err) {}
      hideSelectionToolbar();
    }

    function labelForGraphic(graphic) {
      if (!graphic || !graphic.__sitePlanId) return null;
      return labelLayer.graphics.find(g => g.__labelFor === graphic.__sitePlanId) || null;
    }

    function removeLabelForGraphic(graphic) {
      const label = labelForGraphic(graphic);
      if (label) labelLayer.remove(label);
    }

    function formatObjectLabelText(text) {
      const raw = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 20);
      if (!raw) return '';
      // Keep the editor as a compact single-line input, but render two-line
      // labels by converting only the first space to a line break.
      return raw.replace(' ', '\n');
    }

    function rawObjectLabelText(graphic) {
      if (!graphic) return '';
      return String(graphic.__labelRawText || graphic.__labelText || '').replace(/\n/g, ' ').trim().slice(0, 20);
    }

    function createOrUpdateObjectLabel(graphic, text) {
      const raw = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 20);
      if (!graphic || !raw) return null;
      assignGraphicId(graphic);
      const anchor = getGraphicAnchorPoint(graphic);
      if (!anchor) return null;
      let label = labelForGraphic(graphic);
      const renderedText = formatObjectLabelText(raw);
      const symbol = {
        type: 'text', text: renderedText, color: [0,0,0,1], haloColor: [255,255,255,0.95], haloSize: 1.5,
        font: { family: 'Calibri, Segoe UI, Arial, sans-serif', size: 10, weight: 'bold' }
      };
      if (!label) {
        label = new Graphic({ geometry: anchor.clone ? anchor.clone() : anchor, symbol });
        label.__labelFor = graphic.__sitePlanId;
        label.__nonSelectable = true;
        labelLayer.add(label);
      } else {
        label.geometry = anchor.clone ? anchor.clone() : anchor;
        label.symbol = symbol;
      }
      graphic.__labelRawText = raw;
      graphic.__labelText = renderedText;
      return label;
    }

    function offsetCoordinates(coords, dx, dy) {
      if (typeof coords[0] === 'number') return [coords[0] + dx, coords[1] + dy];
      return coords.map(part => offsetCoordinates(part, dx, dy));
    }

    function cloneGeometryWithOffset(geometry, dx, dy) {
      const json = geometry.toJSON ? geometry.toJSON() : JSON.parse(JSON.stringify(geometry));
      if (json.x != null && json.y != null) { json.x += dx; json.y += dy; }
      if (json.paths) json.paths = offsetCoordinates(json.paths, dx, dy);
      if (json.rings) json.rings = offsetCoordinates(json.rings, dx, dy);
      return geometry.constructor.fromJSON ? geometry.constructor.fromJSON(json) : json;
    }

    function rotateCoordinates(coords, cx, cy, radians) {
      if (typeof coords[0] === 'number') {
        const x = coords[0] - cx;
        const y = coords[1] - cy;
        return [cx + x * Math.cos(radians) - y * Math.sin(radians), cy + x * Math.sin(radians) + y * Math.cos(radians)];
      }
      return coords.map(part => rotateCoordinates(part, cx, cy, radians));
    }

    function rotateGraphicGeometry(graphic, degrees) {
      if (!graphic || !graphic.geometry) return false;
      const geom = graphic.geometry;
      if (geom.type === 'point') {
        const symbol = graphic.symbol && graphic.symbol.clone ? graphic.symbol.clone() : Object.assign({}, graphic.symbol || {});
        symbol.angle = ((Number(symbol.angle || 0) + degrees) % 360 + 360) % 360;
        graphic.symbol = symbol;
        return true;
      }
      if (!geom.extent) return false;
      const center = geom.extent.center;
      const json = geom.toJSON ? geom.toJSON() : JSON.parse(JSON.stringify(geom));
      const radians = degrees * Math.PI / 180;
      if (json.paths) json.paths = rotateCoordinates(json.paths, center.x, center.y, radians);
      if (json.rings) json.rings = rotateCoordinates(json.rings, center.x, center.y, radians);
      graphic.geometry = geom.constructor.fromJSON ? geom.constructor.fromJSON(json) : json;
      return true;
    }

    window.setEditMode = function (mode) {
      selectedEditMode = mode === 'resize' ? 'resize' : 'reshape';
      updateEditModeButtons();
      syncSketchDefaultUpdateOptions(selectedGraphic);
      if (selectedGraphic) startSketchUpdate(selectedGraphic);
    };

    window.toggleSnapping = function (enabled) {
      const isEnabled = !!enabled;
      sketch.snappingOptions.enabled = isEnabled;
      sketch.snappingOptions.selfEnabled = isEnabled;
      sketch.snappingOptions.featureEnabled = isEnabled;
      measureSketch.snappingOptions.enabled = isEnabled;
      measureSketch.snappingOptions.selfEnabled = isEnabled;
      measureSketch.snappingOptions.featureEnabled = isEnabled;
      refreshSnapSources();
    };

    window.duplicateSelectedGraphic = function () {
      const source = selectedGraphic;
      if (!isSelectableGraphic(source)) return;
      const extent = view.extent;
      const offset = extent ? Math.max(extent.width, extent.height) * 0.015 : 25;
      const copy = new Graphic({
        geometry: cloneGeometryWithOffset(source.geometry, offset, -offset),
        symbol: source.symbol && source.symbol.clone ? source.symbol.clone() : JSON.parse(JSON.stringify(source.symbol || {})),
        attributes: Object.assign({}, source.attributes || {})
      });
      Object.keys(source).forEach(key => { if (key.startsWith('__') && key !== '__sitePlanId') copy[key] = source[key]; });
      assignGraphicId(copy);
      drawLayer.add(copy);
      if (source.__labelText || source.__labelRawText) createOrUpdateObjectLabel(copy, rawObjectLabelText(source));
      selectGraphic(copy);
      refreshSnapSources();
      fireGraphicCreated(copy);
      if (copy.geometry && copy.geometry.type === 'polygon') refreshSideLabelsForGraphic(copy);
    };

    window.rotateSelectedBy = function (deltaDegrees) {
      if (!selectedGraphic) return;
      if (rotateGraphicGeometry(selectedGraphic, Number(deltaDegrees || 0))) {
        if (selectedGraphic.__labelText || selectedGraphic.__labelRawText) createOrUpdateObjectLabel(selectedGraphic, rawObjectLabelText(selectedGraphic));
        if (selectedGraphic.geometry && selectedGraphic.geometry.type === 'polygon') refreshSideLabelsForGraphic(selectedGraphic);
        updateSelectedShapeBox();
        // Restart the Sketch update session so Esri's transform/rotate handles
        // stay synchronized with the newly rotated geometry. Without this, the
        // orange transform box can remain aligned to the pre-rotation geometry.
        startSketchUpdate(selectedGraphic);
        requestAnimationFrame(positionSelectionToolbar);
      }
    };

    // ── Inline label editor (replaces toolbar buttons when T is clicked) ──
    // Adds .editing-label to #selection-toolbar; CSS hides the buttons and
    // shows #label-edit-form in the same toolbar position.
    function enterLabelEditMode() {
      const toolbar = toolbarElement();
      const input = document.getElementById('label-edit-input');
      if (!toolbar || !selectedGraphic) return;
      toolbar.classList.add('editing-label');
      if (input) {
        input.value = rawObjectLabelText(selectedGraphic);
        // Reposition because the form may have a different width than the buttons
        requestAnimationFrame(() => { positionSelectionToolbar(); input.focus(); input.select(); });
      }
    }

    function exitLabelEditMode() {
      const toolbar = toolbarElement();
      if (toolbar) toolbar.classList.remove('editing-label');
      requestAnimationFrame(positionSelectionToolbar);
    }

    function applyLabelFromInput() {
      if (!selectedGraphic) { exitLabelEditMode(); return; }
      const input = document.getElementById('label-edit-input');
      const value = input ? String(input.value || '').trim() : '';
      if (!value) {
        removeLabelForGraphic(selectedGraphic);
        delete selectedGraphic.__labelText;
        delete selectedGraphic.__labelRawText;
      } else {
        createOrUpdateObjectLabel(selectedGraphic, value);
      }
      exitLabelEditMode();
    }

    window.openLabelEditor = function () {
      if (!selectedGraphic) return;
      enterLabelEditMode();
    };

    // Wire confirm/clear buttons and Enter/Escape inside the input.
    (function wireLabelEditFormControls() {
      const clearBtn = document.getElementById('label-edit-clear');
      const confirmBtn = document.getElementById('label-edit-confirm');
      const input = document.getElementById('label-edit-input');
      if (clearBtn) {
        clearBtn.addEventListener('click', ev => {
          ev.preventDefault();
          ev.stopPropagation();
          if (input) {
            input.value = '';
            input.focus();
          }
        });
      }
      if (confirmBtn) confirmBtn.addEventListener('click', applyLabelFromInput);
      if (input) {
        input.addEventListener('keydown', ev => {
          if (ev.key === 'Enter') { ev.preventDefault(); applyLabelFromInput(); }
          else if (ev.key === 'Escape') { ev.preventDefault(); exitLabelEditMode(); }
          // Block all keystrokes from reaching the map/sketch keyboard handlers
          ev.stopPropagation();
        });
      }
    })();

    window.deleteSelected = function () {
      if (!selectedGraphic) return;
      const g = selectedGraphic;
      try { if (sketch && sketch.state !== 'idle') sketch.cancel(); } catch (err) {}
      fireGraphicDeleted(g);
      removeLabelForGraphic(g);
      removeSideLabelsForGraphic(g);
      drawLayer.remove(g);
      hideSelectionToolbar();
    };

    view.on('click', event => {
      // Don't interfere with in-progress sketch interactions (drawing or
      // dragging an edit handle). Sketch handles those clicks itself.
      if (sketch && sketch.state === 'active') return;
      if (measureSketch && measureSketch.state === 'active') return;
      view.hitTest(event).then(response => {
        const results = response.results || [];
        const selectHit = results.find(r =>
          r.graphic && r.graphic.layer === drawLayer && isSelectableGraphic(r.graphic)
        );
        if (selectHit) {
          if (selectHit.graphic !== selectedGraphic) selectGraphic(selectHit.graphic);
          return;
        }
        // No selectable graphic hit. Check whether the click landed on a
        // "protected" overlay element (a label, a measurement label, a live
        // preview graphic, or a non-selectable graphic in drawLayer such as a
        // tool's child overlay). Only deselect for clicks on truly empty map
        // space (or on reference layers like parcels/flood zones).
        const hitProtected = results.some(r =>
          r.graphic && (
            r.graphic.layer === labelLayer ||
            r.graphic.layer === measureLayer ||
            r.graphic.layer === previewLayer ||
            (r.graphic.layer === drawLayer && r.graphic.__nonSelectable)
          )
        );
        if (selectedGraphic && !hitProtected) clearSelection();
      }).catch(() => {});
    });

    view.watch('stationary', () => positionSelectionToolbar());
    view.watch('extent', () => positionSelectionToolbar());
    view.watch('rotation', () => positionSelectionToolbar());

    sketch.on('update', event => {
      const g = event.graphics && event.graphics[0];
      if (g && isSelectableGraphic(g)) {
        if (event.state === 'start') rememberRectangleUpdateStart(g);
        selectedGraphic = g;
        if (g.__labelText || g.__labelRawText) createOrUpdateObjectLabel(g, rawObjectLabelText(g));
        // Live side-label refresh while the user is dragging vertices or
        // moving the shape, plus the final state. If a rectangle is edited in
        // Reshape/Edit Points mode, permanently switch that object to all-side
        // measurements because it may no longer have equal opposite sides.
        // A whole-object move while Reshape is selected should not trigger this.
        if (g.geometry && g.geometry.type === 'polygon') {
          if (shouldMarkRectangleAllSidesFromUpdate(event, g)) markRectangleAllSideLabels(g);
          refreshSideLabelsForGraphic(g);
        }
        updateSelectedShapeBox();
        showSelectionToolbar(g);
        fireGraphicUpdated(g, event);
        if (event.state === 'complete' || event.state === 'cancel') clearRectangleUpdateStart(g);
      }
      if (event.state === 'complete' || event.state === 'cancel') {
        if (selectedGraphic) showSelectionToolbar(selectedGraphic);
      }
    });

    // Tool files call sketch.create('polygon' | 'rectangle' | 'polyline') after
    // setting sketch.viewModel.polygonSymbol (or polylineSymbol) to their own
    // symbol. The runtime assigns an ID, refreshes snap sources, and fires
    // onGraphicCreated on completion. During 'active' state we also render
    // a live side-label preview on previewLayer so the user sees each segment's
    // length while drawing.
    sketch.on('create', event => {
      if (event.state === 'start') {
        clearLiveSideLabels();
        // The pending tool type is set by the tool file via window.__sitePlanPendingToolType
        // (assigned just before calling sketch.create). Captured here so the
        // live preview can apply rectangle-only-two-sides logic.
        livePreviewToolType = window.__sitePlanPendingToolType || null;
        return;
      }
      if (event.state === 'active') {
        if (event.graphic && event.graphic.geometry) {
          refreshLiveSideLabels(event.graphic.geometry, livePreviewToolType);
        }
        return;
      }
      if (event.state === 'cancel') {
        clearLiveSideLabels();
        return;
      }
      if (event.state !== 'complete') return;
      clearLiveSideLabels();
      const g = event.graphic;
      if (!g) return;
      assignGraphicId(g);
      refreshSnapSources();
      fireGraphicCreated(g);
      // Build permanent side labels on labelLayer for the finalized graphic.
      // (Tool files may also tag g.__toolType via onGraphicCreated subscribers
      // — that happens before this point because onGraphicCreated subscribers
      // fire inside fireGraphicCreated above.)
      if (g.geometry && g.geometry.type === 'polygon') {
        refreshSideLabelsForGraphic(g);
      }
      // Force the finalized drawing into the currently selected edit mode.
      // Without this, Sketch's default create/update handoff can leave new
      // rectangles/polygons in transform/resize mode even while the Reshape
      // button is active.
      const selectAfterCreate = () => {
        if (isSelectableGraphic(g)) selectGraphic(g);
      };
      if (window.requestAnimationFrame) window.requestAnimationFrame(selectAfterCreate);
      else setTimeout(selectAfterCreate, 0);
    });

    updateEditModeButtons();
    syncSketchDefaultUpdateOptions(selectedGraphic);

    // ── Core measurement infrastructure ──────────────────────────────────
    let activeMeasureMode = null;
    let liveMeasureLabel = null;
    let measureGraphicCounter = 1;

    const measureLineSymbol = {
      type: 'simple-line',
      color: [0, 0, 0, 1],
      width: 2,
      style: 'dash'
    };
    const measureFillSymbol = {
      type: 'simple-fill',
      color: [255, 255, 255, 0.12],
      outline: { type:'simple-line', color:[0, 0, 0, 1], width:2, style:'dash' }
    };
    const liveMeasureLabelSymbol = {
      type: 'text',
      text: '',
      color: [0,0,0,1],
      haloColor: [255,255,255,0.95],
      haloSize: 1.5,
      yoffset: 10,
      font: { family:'Calibri, Segoe UI, Arial, sans-serif', size:12, weight:'bold' }
    };

    function numberWithCommas(value, decimals = 0) {
      const n = Number(value);
      if (!Number.isFinite(n)) return '—';
      return n.toLocaleString('en-US', { minimumFractionDigits:decimals, maximumFractionDigits:decimals });
    }

    function geometryLengthFeet(geometry) {
      if (!geometry) return 0;
      try {
        const len = geometryEngine.geodesicLength(geometry, 'feet');
        if (Number.isFinite(len)) return Math.abs(len);
      } catch (err) {}
      try {
        const len = geometryEngine.planarLength(geometry, 'feet');
        if (Number.isFinite(len)) return Math.abs(len);
      } catch (err) {}
      return 0;
    }

    function geometryAreaSqFt(geometry) {
      if (!geometry) return 0;
      try {
        const area = geometryEngine.geodesicArea(geometry, 'square-feet');
        if (Number.isFinite(area)) return Math.abs(area);
      } catch (err) {}
      try {
        const area = geometryEngine.planarArea(geometry, 'square-feet');
        if (Number.isFinite(area)) return Math.abs(area);
      } catch (err) {}
      return 0;
    }

    function formatDistance(geometryOrFeet) {
      const feet = typeof geometryOrFeet === 'number' ? geometryOrFeet : geometryLengthFeet(geometryOrFeet);
      if (!Number.isFinite(feet) || feet <= 0) return '0 ft';
      if (feet >= 5280) return numberWithCommas(feet / 5280, 2) + ' mi';
      return numberWithCommas(feet, feet < 100 ? 1 : 0) + ' ft';
    }

    function formatArea(geometryOrSqFt) {
      const sqFt = typeof geometryOrSqFt === 'number' ? geometryOrSqFt : geometryAreaSqFt(geometryOrSqFt);
      if (!Number.isFinite(sqFt) || sqFt <= 0) return '0 sq ft / 0.00 ac';
      return numberWithCommas(sqFt, 0) + ' sq ft / ' + numberWithCommas(sqFt / 43560, 2) + ' ac';
    }

    function pointFromXY(x, y, spatialReference) {
      return { type:'point', x, y, spatialReference };
    }

    function pathMidpoint(path, spatialReference) {
      if (!path || !path.length) return null;
      if (path.length === 1) return pointFromXY(path[0][0], path[0][1], spatialReference);
      let total = 0;
      for (let i = 1; i < path.length; i++) {
        const dx = path[i][0] - path[i - 1][0];
        const dy = path[i][1] - path[i - 1][1];
        total += Math.sqrt(dx * dx + dy * dy);
      }
      if (!Number.isFinite(total) || total <= 0) {
        const coord = path[Math.floor((path.length - 1) / 2)];
        return pointFromXY(coord[0], coord[1], spatialReference);
      }
      const halfway = total / 2;
      let traveled = 0;
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1];
        const b = path[i];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const seg = Math.sqrt(dx * dx + dy * dy);
        if (traveled + seg >= halfway) {
          const ratio = seg > 0 ? (halfway - traveled) / seg : 0;
          return pointFromXY(a[0] + dx * ratio, a[1] + dy * ratio, spatialReference);
        }
        traveled += seg;
      }
      const last = path[path.length - 1];
      return pointFromXY(last[0], last[1], spatialReference);
    }

    function polylineMidpoint(polyline) {
      if (!polyline || !polyline.paths || !polyline.paths.length) return null;
      let longestPath = polyline.paths[0];
      let longestLength = -1;
      polyline.paths.forEach(path => {
        let len = 0;
        if (path && path.length > 1) {
          for (let i = 1; i < path.length; i++) {
            const dx = path[i][0] - path[i - 1][0];
            const dy = path[i][1] - path[i - 1][1];
            len += Math.sqrt(dx * dx + dy * dy);
          }
        }
        if (len > longestLength) { longestLength = len; longestPath = path; }
      });
      return pathMidpoint(longestPath, polyline.spatialReference);
    }

    function measureLabelAnchor(geometry) {
      if (!geometry) return null;
      if (geometry.type === 'point') return geometry;
      if (geometry.type === 'polyline') return polylineMidpoint(geometry) || (geometry.extent ? geometry.extent.center : null);
      if (geometry.type === 'polygon') return geometry.centroid || (geometry.extent ? geometry.extent.center : null);
      return geometry.extent ? geometry.extent.center : null;
    }

    function assignMeasureId(graphic) {
      if (graphic && !graphic.__measureId) graphic.__measureId = 'measure-' + (measureGraphicCounter++);
      return graphic ? graphic.__measureId : null;
    }

    function findMeasureLabel(measureId, targetLayer) {
      if (!measureId) return null;
      const layer = targetLayer || measureLayer;
      return layer.graphics.find(g => g.__measureId === measureId && g.__measureRole === 'label') || null;
    }

    function createMeasureLabel(geometry, text, targetLayer, measureId) {
      const anchor = measureLabelAnchor(geometry);
      if (!anchor || !text) return null;
      const symbol = Object.assign({}, liveMeasureLabelSymbol, { text });
      let label = measureId ? findMeasureLabel(measureId, targetLayer) : null;
      if (!label) {
        label = new Graphic({ geometry: anchor.clone ? anchor.clone() : anchor, symbol });
        label.__nonSelectable = true;
        label.__isMeasurementLabel = true;
        label.__measureRole = 'label';
        if (measureId) label.__measureId = measureId;
        (targetLayer || measureLayer).add(label);
      } else {
        label.geometry = anchor.clone ? anchor.clone() : anchor;
        label.symbol = symbol;
      }
      return label;
    }

    function createOrUpdateMeasureLabelForGraphic(graphic, targetLayer) {
      if (!graphic || !graphic.geometry) return null;
      const measureId = assignMeasureId(graphic);
      const text = measurementTextForGeometry(graphic.geometry);
      if (!text) return null;
      return createMeasureLabel(graphic.geometry, text, targetLayer || measureLayer, measureId);
    }

    function removeMeasureLabelForGraphic(graphic, targetLayer) {
      const measureId = graphic && graphic.__measureId;
      if (!measureId) return;
      const layers = targetLayer ? [targetLayer] : [measureLayer, previewLayer, labelLayer];
      layers.forEach(layer => {
        layer.graphics.filter(g => g.__measureId === measureId && g.__measureRole === 'label').toArray().forEach(g => layer.remove(g));
      });
    }

    // ── Per-segment side labels for polygons/rectangles ─────────────────────
    // Each drawn polygon or rectangle gets distance labels along its sides.
    // Standard rectangles start with only two adjacent side labels (length × width)
    // since opposite sides are equal. If a rectangle is reshaped/edit-points
    // edited, it is permanently switched to all-side labels so the dimensions
    // remain accurate for irregular quadrilateral/polygon shapes.
    // sideLabelMap key: graphic.__sitePlanId → Graphic[]   (on labelLayer)
    // Live previews during sketch.create live on previewLayer instead.
    const sideLabelMap = new Map();
    const sideLabelSymbol = {
      type: 'text',
      text: '',
      color: [0, 0, 0, 1],
      haloColor: [255, 255, 255, 0.95],
      haloSize: 1.5,
      font: { family: 'Calibri, Segoe UI, Arial, sans-serif', size: 9, weight: 'bold' }
    };

    function polygonSegmentMidpoints(geometry) {
      // Returns an array of { mid: point, lengthFt: number } per side.
      // Uses the outer ring only. ArcGIS polygon rings are commonly stored as
      // A → B → C → D → A; remove the duplicate closing vertex and explicitly
      // add the last → first segment so completed four-sided polygons receive
      // all four labels.
      if (!geometry || geometry.type !== 'polygon' || !geometry.rings || !geometry.rings.length) return [];

      const ring = geometry.rings[0];
      const sr = geometry.spatialReference;
      if (!ring || ring.length < 2) return [];

      const ringClosed = ring.length > 2 &&
        ring[0][0] === ring[ring.length - 1][0] &&
        ring[0][1] === ring[ring.length - 1][1];

      const pts = ringClosed ? ring.slice(0, -1) : ring.slice();
      const out = [];

      function addSegment(a, b, isClosing) {
        if (!a || !b) return;

        const mid = pointFromXY((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, sr);
        const segGeom = {
          type: 'polyline',
          paths: [[a, b]],
          spatialReference: sr
        };

        let lengthFt = 0;
        try {
          lengthFt = Math.abs(geometryEngine.geodesicLength(segGeom, 'feet') || 0);
        } catch (err) {}

        if (!Number.isFinite(lengthFt) || lengthFt <= 0) {
          try {
            lengthFt = Math.abs(geometryEngine.planarLength(segGeom, 'feet') || 0);
          } catch (err) {}
        }

        // Avoid cluttering the map with zero-length or accidental duplicate labels.
        if (lengthFt > 0.5) {
          out.push({ mid, lengthFt, __closing: !!isClosing });
        }
      }

      for (let i = 0; i < pts.length - 1; i++) {
        addSegment(pts[i], pts[i + 1], false);
      }

      // Completed polygon rings are closed by duplicating the first point at the
      // end. Live/in-progress polygon geometries may not be closed yet. In both
      // cases, add the last → first segment when there are enough vertices.
      if (pts.length >= 3) {
        addSegment(pts[pts.length - 1], pts[0], true);
      }

      return out;
    }

    function buildSideLabelGraphics(geometry, labelOnlyTwoRectangleSides) {
      const segments = polygonSegmentMidpoints(geometry);
      if (!segments.length) return [];
      // Standard rectangle: label the first two adjacent sides only (one per dimension).
      // Reshaped rectangles and polygons: label all segments.
      const toLabel = labelOnlyTwoRectangleSides ? segments.slice(0, 2) : segments;
      return toLabel.map(seg => {
        const symbol = Object.assign({}, sideLabelSymbol, { text: formatDistance(seg.lengthFt) });
        const label = new Graphic({ geometry: seg.mid, symbol });
        label.__nonSelectable = true;
        label.__isSideLabel = true;
        return label;
      });
    }

    function isRectangleGraphic(graphic) {
      return !!(graphic && graphic.__toolType === 'rectangle');
    }

    function rectangleUsesAllSideLabels(graphic) {
      return !!(
        graphic &&
        (graphic.__rectangleAllSideLabels ||
          (graphic.attributes && graphic.attributes.rectangleMeasurementMode === 'allSides'))
      );
    }

    function rectangleUsesTwoSideLabels(graphic) {
      return isRectangleGraphic(graphic) && !rectangleUsesAllSideLabels(graphic);
    }

    function markRectangleAllSideLabels(graphic) {
      if (!isRectangleGraphic(graphic)) return false;
      if (rectangleUsesAllSideLabels(graphic)) return false;
      graphic.__rectangleAllSideLabels = true;
      graphic.attributes = Object.assign({}, graphic.attributes || {}, {
        rectangleMeasurementMode: 'allSides'
      });
      return true;
    }

    // Track the polygon's vertex layout at the start of a Sketch update so we
    // can tell the difference between dragging/moving the entire rectangle and
    // actually reshaping one or more vertices. A pure move changes x/y values,
    // but the vertex layout relative to the first vertex remains the same.
    const rectangleUpdateStartShapes = new WeakMap();

    function geometryOuterRingPoints(geometry) {
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

    function rectangleShapeSignature(geometry) {
      const pts = geometryOuterRingPoints(geometry);
      if (pts.length < 3) return null;
      const origin = pts[0];
      return pts.map(pt => [pt[0] - origin[0], pt[1] - origin[1]]);
    }

    function shapeSignaturesMatch(a, b) {
      if (!a || !b || a.length !== b.length) return false;
      let maxAbs = 0;
      a.forEach(pt => {
        maxAbs = Math.max(maxAbs, Math.abs(pt[0]), Math.abs(pt[1]));
      });
      b.forEach(pt => {
        maxAbs = Math.max(maxAbs, Math.abs(pt[0]), Math.abs(pt[1]));
      });
      // Tolerance is in map units. Use a small absolute floor plus a tiny
      // relative tolerance so ordinary floating-point jitter does not mark a
      // rectangle as reshaped, while actual vertex edits still do.
      const tolerance = Math.max(0.001, maxAbs * 1e-8);
      for (let i = 0; i < a.length; i++) {
        if (Math.abs(a[i][0] - b[i][0]) > tolerance) return false;
        if (Math.abs(a[i][1] - b[i][1]) > tolerance) return false;
      }
      return true;
    }

    function rememberRectangleUpdateStart(graphic) {
      if (!isRectangleGraphic(graphic) || !graphic.geometry) return;
      const sig = rectangleShapeSignature(graphic.geometry);
      if (sig) rectangleUpdateStartShapes.set(graphic, sig);
    }

    function clearRectangleUpdateStart(graphic) {
      if (!graphic) return;
      try { rectangleUpdateStartShapes.delete(graphic); } catch (err) {}
    }

    function rectangleShapeChangedSinceUpdateStart(graphic) {
      if (!isRectangleGraphic(graphic) || !graphic.geometry) return false;
      const startSig = rectangleUpdateStartShapes.get(graphic);
      const currentSig = rectangleShapeSignature(graphic.geometry);
      if (!startSig || !currentSig) return false;
      return !shapeSignaturesMatch(startSig, currentSig);
    }

    function shouldMarkRectangleAllSidesFromUpdate(event, graphic) {
      if (!event || !isRectangleGraphic(graphic) || selectedEditMode !== 'reshape') return false;
      if (rectangleUsesAllSideLabels(graphic)) return false;
      const info = event.toolEventInfo || {};
      const type = info.type ? String(info.type).toLowerCase() : '';

      // Whole-object moves can happen while Reshape/Edit Points is active. Keep
      // those as normal rectangles with two labels.
      if (type && /move/.test(type) && !/vertex|reshape/.test(type)) return false;

      // Explicit vertex/reshape events should switch the object to all-side
      // labels. This is the clean path when Sketch provides detailed event info.
      if (type && (/reshape|vertex/.test(type))) return true;

      // Fallback for less-specific Sketch events: only switch when the geometry's
      // vertex layout changes. A pure move keeps the same relative layout, while
      // dragging a vertex changes it.
      return rectangleShapeChangedSinceUpdateStart(graphic);
    }

    function refreshSideLabelsForGraphic(graphic) {
      if (!graphic || !graphic.geometry || graphic.geometry.type !== 'polygon') return;
      const id = assignGraphicId(graphic) && graphic.__sitePlanId;
      if (!id) return;
      removeSideLabelsForGraphic(graphic);
      const labels = buildSideLabelGraphics(graphic.geometry, rectangleUsesTwoSideLabels(graphic));
      if (!labels.length) return;
      labels.forEach(l => { l.__sideLabelOf = id; labelLayer.add(l); });
      sideLabelMap.set(id, labels);
    }

    function removeSideLabelsForGraphic(graphic) {
      const id = graphic && graphic.__sitePlanId;
      if (!id) return;
      const existing = sideLabelMap.get(id);
      if (existing) {
        existing.forEach(l => labelLayer.remove(l));
        sideLabelMap.delete(id);
      }
    }

    // Live (in-progress) side labels during sketch.create. Live labels live on
    // previewLayer and are wiped on each refresh and on create-complete/cancel.
    let livePreviewToolType = null;
    function refreshLiveSideLabels(geometry, toolType) {
      previewLayer.removeAll();
      if (!geometry || geometry.type !== 'polygon') return;
      const labelOnlyTwoRectangleSides = toolType === 'rectangle';
      const labels = buildSideLabelGraphics(geometry, labelOnlyTwoRectangleSides);
      labels.forEach(l => { l.__isLivePreview = true; previewLayer.add(l); });
    }
    function clearLiveSideLabels() {
      previewLayer.removeAll();
      livePreviewToolType = null;
    }


    function measurementTextForGeometry(geometry) {
      if (!geometry) return '';
      if (geometry.type === 'polyline') return formatDistance(geometry);
      if (geometry.type === 'polygon') return formatArea(geometry);
      return '';
    }

    function updateLiveMeasurePreview(geometry) {
      previewLayer.removeAll();
      if (!geometry) return;
      const text = measurementTextForGeometry(geometry);
      if (!text) return;
      liveMeasureLabel = createMeasureLabel(geometry, text, previewLayer);
    }

    function clearLiveMeasurePreview() {
      liveMeasureLabel = null;
      previewLayer.removeAll();
    }

    function updateMeasureButtons() {
      const distance = document.getElementById('measure-distance-row');
      const area = document.getElementById('measure-area-row');
      const clear = document.getElementById('measure-clear-btn');
      if (distance) distance.classList.toggle('active', activeMeasureMode === 'distance');
      if (area) area.classList.toggle('active', activeMeasureMode === 'area');
      if (distance) distance.querySelector('input').checked = activeMeasureMode === 'distance';
      if (area) area.querySelector('input').checked = activeMeasureMode === 'area';
      if (clear) clear.disabled = measureLayer.graphics.length === 0 && previewLayer.graphics.length === 0;
      const toggle = document.getElementById('measure-toggle-btn');
      if (toggle) toggle.classList.toggle('active', !!activeMeasureMode);
    }

    function cancelMeasureSketch() {
      try { if (measureSketch && measureSketch.state !== 'idle') measureSketch.cancel(); } catch (err) {}
      activeMeasureMode = null;
      clearLiveMeasurePreview();
      updateMeasureButtons();
    }

    function startMeasureMode(mode) {
      clearSelection();
      try { if (sketch && sketch.state !== 'idle') sketch.cancel(); } catch (err) {}
      try { if (measureSketch && measureSketch.state !== 'idle') measureSketch.cancel(); } catch (err) {}
      activeMeasureMode = mode;
      updateMeasureButtons();
      if (mode === 'distance') {
        measureSketch.create('polyline', { mode:'click', symbol:measureLineSymbol });
      } else if (mode === 'area') {
        measureSketch.create('polygon', { mode:'click', symbol:measureFillSymbol });
      }
    }

    function clearTemporaryMeasurements() {
      try { if (measureSketch && measureSketch.state !== 'idle') measureSketch.cancel(); } catch (err) {}
      activeMeasureMode = null;
      measureLayer.removeAll();
      clearLiveMeasurePreview();
      updateMeasureButtons();
    }

    function createMeasureControl() {
      const control = document.createElement('div');
      control.id = 'measure-control';
      control.className = 'measure-flyout-control esri-component';
      control.innerHTML = `
        <button type="button" class="measure-toggle-btn" id="measure-toggle-btn" title="Measurement tools" aria-label="Measurement tools">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 17.5 17.5 3 21 6.5 6.5 21 3 17.5Z"></path>
            <path d="M14.5 6 16.5 8"></path>
            <path d="M11.5 9 13.5 11"></path>
            <path d="M8.5 12 10.5 14"></path>
            <path d="M5.5 15 7.5 17"></path>
          </svg>
        </button>
        <div class="measure-panel" role="dialog" aria-label="Measurement tools">
          <div class="measure-panel-head" id="measure-panel-head"><span>Measure</span><button type="button" class="measure-close-btn" id="measure-close-btn" aria-label="Close measurement tools">×</button></div>
          <div class="measure-panel-body">
            <div class="measure-mode-row">
              <button type="button" class="measure-check-row" id="measure-distance-row"><input type="checkbox" tabindex="-1" aria-hidden="true" /><span>Distance</span></button>
              <button type="button" class="measure-check-row" id="measure-area-row"><input type="checkbox" tabindex="-1" aria-hidden="true" /><span>Area</span></button>
              <button type="button" class="measure-clear-btn" id="measure-clear-btn">Clear measurements</button>
            </div>
          </div>
        </div>`;
      const open = () => control.classList.add('expanded');
      const close = () => control.classList.remove('expanded');
      control.querySelector('#measure-toggle-btn').addEventListener('click', e => { e.stopPropagation(); open(); });
      control.querySelector('#measure-panel-head').addEventListener('click', e => { e.stopPropagation(); close(); });
      control.querySelector('#measure-close-btn').addEventListener('click', e => { e.stopPropagation(); close(); });
      control.querySelector('#measure-distance-row').addEventListener('click', e => { e.stopPropagation(); startMeasureMode('distance'); });
      control.querySelector('#measure-area-row').addEventListener('click', e => { e.stopPropagation(); startMeasureMode('area'); });
      control.querySelector('#measure-clear-btn').addEventListener('click', e => { e.stopPropagation(); clearTemporaryMeasurements(); });
      return control;
    }

    const measureControl = createMeasureControl();
    view.ui.add(measureControl, 'top-left');

    measureSketch.on('create', event => {
      const geometry = event.graphic && event.graphic.geometry;
      if (event.state === 'active') {
        updateLiveMeasurePreview(geometry);
        return;
      }
      if (event.state === 'cancel') {
        clearLiveMeasurePreview();
        activeMeasureMode = null;
        updateMeasureButtons();
        return;
      }
      if (event.state === 'complete') {
        clearLiveMeasurePreview();
        if (event.graphic) {
          event.graphic.__nonSelectable = true;
          event.graphic.__isMeasurement = true;
          event.graphic.__measureRole = 'shape';
          assignMeasureId(event.graphic);
          if (event.graphic.geometry && event.graphic.geometry.type === 'polyline') event.graphic.symbol = measureLineSymbol;
          if (event.graphic.geometry && event.graphic.geometry.type === 'polygon') event.graphic.symbol = measureFillSymbol;
          createOrUpdateMeasureLabelForGraphic(event.graphic, measureLayer);
        }
        activeMeasureMode = null;
        updateMeasureButtons();
      }
    });

    // Keep bound measurement labels synchronized if a future workflow edits
    // temporary measurement graphics or reuses the measurement helpers.
    measureSketch.on('update', event => {
      (event.graphics || []).forEach(graphic => {
        if (graphic && graphic.__isMeasurement && graphic.__measureRole !== 'label') {
          createOrUpdateMeasureLabelForGraphic(graphic, measureLayer);
        }
      });
      if (event.state === 'complete' || event.state === 'cancel') updateMeasureButtons();
    });

    updateMeasureButtons();

    const northButton = document.createElement('button');
    northButton.type = 'button';
    northButton.className = 'north-reset-btn esri-widget--button esri-widget';
    northButton.title = 'Reset map rotation to north';
    northButton.setAttribute('aria-label', 'Reset map rotation to north');
    northButton.innerHTML = '<svg class="north-reset-icon" id="north-reset-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 20.5 21 12 16.2 12 2.5Z" fill="currentColor"/><path d="M12 2.5 3.5 21 12 16.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 2.5 12 16.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
    northButton.onclick = () => view.goTo({ rotation:0 }, { duration:250 }).catch(() => {});
    view.ui.add(northButton, 'top-left');

    view.watch('rotation', value => {
      const icon = document.getElementById('north-reset-icon');
      if (icon) icon.style.transform = 'rotate(' + (value || 0) + 'deg)';
    });

    // Hidden native attribution reader + visible app-controlled attribution strip.
    const nativeReader = document.createElement('div');
    nativeReader.id = 'native-attribution-reader';
    document.getElementById('map-wrap').appendChild(nativeReader);
    new Attribution({ view, container:nativeReader });

    const visibleAttr = document.createElement('div');
    visibleAttr.id = 'site-attribution';
    visibleAttr.className = 'site-attribution-map-anchored esri-attribution';
    visibleAttr.tabIndex = 0;
    visibleAttr.setAttribute('role', 'button');
    visibleAttr.setAttribute('aria-label', 'Map data acknowledgments');
    visibleAttr.innerHTML = '<div class="esri-attribution__sources"></div>';
    document.getElementById('map-wrap').appendChild(visibleAttr);
    visibleAttr.addEventListener('click', () => visibleAttr.classList.toggle('esri-attribution--open'));
    visibleAttr.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); visibleAttr.classList.toggle('esri-attribution--open'); }
    });

    function readNativeAttribution() {
      const sources = nativeReader.querySelector('.esri-attribution__sources');
      const text = sources ? sources.textContent.trim().replace(/\s+/g, ' ') : '';
      if (text) nativeAttribution = text;
      updateAttribution();
    }

    function updateAttribution() {
      const parts = [];
      parts.push('<a class="site-attribution-link" href="https://www.esri.com/en-us/home" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();">Powered by Esri</a>');
      if (nativeAttribution) parts.push(nativeAttribution);
      parts.push('Walla Walla County');
      Object.keys(referenceLayerGroups).forEach(key => {
        const group = referenceLayerGroups[key];
        if (layerCreditLabels[key] && group.some(layer => layer.visible)) parts.push(layerCreditLabels[key]);
      });
      const unique = [];
      parts.forEach(part => { if (part && !unique.includes(part)) unique.push(part); });
      const sources = visibleAttr.querySelector('.esri-attribution__sources');
      if (sources) sources.innerHTML = unique.join(' | ');
    }

    setInterval(readNativeAttribution, 1500);
    view.watch('stationary', () => readNativeAttribution());

    function basemapThumbSvg(basemapId) {
      if (basemapId === 'satellite' || basemapId === 'hybrid') {
        return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#2d4a1e"/><rect x="0" y="0" width="32" height="32" fill="#3a5c28" opacity=".8"/><rect x="32" y="32" width="32" height="32" fill="#3a5c28" opacity=".8"/><path d="M0 40 Q16 30 32 38 Q48 46 64 36" fill="none" stroke="#5b8cd4" stroke-width="2" opacity=".7"/></svg>';
      }
      if (basemapId === 'topo-vector') {
        return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#f0ebe0"/><ellipse cx="32" cy="36" rx="26" ry="16" fill="none" stroke="#b8a882" stroke-width="1.5"/><ellipse cx="32" cy="36" rx="18" ry="10" fill="none" stroke="#b8a882" stroke-width="1.5"/><ellipse cx="32" cy="36" rx="10" ry="5" fill="none" stroke="#b8a882" stroke-width="1.5"/></svg>';
      }
      if (basemapId === 'gray-vector') {
        return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#f0ede7"/><line x1="0" y1="32" x2="64" y2="32" stroke="#ccc9c2" stroke-width="2.5"/><line x1="32" y1="0" x2="32" y2="64" stroke="#ccc9c2" stroke-width="1.5"/><line x1="0" y1="20" x2="64" y2="20" stroke="#ccc9c2" stroke-width="1"/><line x1="0" y1="48" x2="64" y2="48" stroke="#ccc9c2" stroke-width="1"/></svg>';
      }
      return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#e8e0d0"/><rect x="0" y="28" width="64" height="8" fill="#fff" opacity=".7"/><rect x="24" y="0" width="6" height="64" fill="#fff" opacity=".5"/><circle cx="32" cy="22" r="6" fill="#c0392b" opacity=".7"/></svg>';
    }

    function basemapLabel(basemapId) {
      if (basemapId === 'gray-vector') return 'Gray Canvas';
      if (basemapId === 'topo-vector') return 'Topo';
      if (basemapId === 'satellite' || basemapId === 'hybrid') return 'Imagery';
      return 'Streets';
    }

    function refreshBasemapButtons() {
      document.querySelectorAll('#basemap-panel .basemap-option').forEach(btn => btn.classList.remove('active'));
      const buttonMap = { 'streets-vector':'bm-option-streets', 'topo-vector':'bm-option-topo', 'gray-vector':'bm-option-gray', 'satellite':'bm-option-imagery', 'hybrid':'bm-option-imagery' };
      const activeBtn = document.getElementById(buttonMap[activeBasemapId]);
      if (activeBtn) activeBtn.classList.add('active');
      const thumb = document.getElementById('bm-current-thumb');
      const label = document.getElementById('bm-current-label');
      if (thumb) thumb.innerHTML = basemapThumbSvg(activeBasemapId);
      if (label) label.textContent = 'Basemap';
    }

    window.switchBasemap = function (basemapId) {
      activeBasemapId = basemapId;
      map.basemap = basemapId;
      refreshBasemapButtons();
      toggleBasemapPanel(false);
      setStatus('Basemap changed to ' + basemapLabel(basemapId) + '.', true);
      setTimeout(readNativeAttribution, 750);
    };

    window.toggleBasemapPanel = function (open) {
      const control = document.getElementById('basemap-control');
      if (!control) return;
      const shouldOpen = open == null ? !control.classList.contains('expanded') : !!open;
      control.classList.toggle('expanded', shouldOpen);
      if (shouldOpen) document.getElementById('layer-control')?.classList.remove('expanded');
    };

    window.toggleLayerPanel = function (open) {
      const control = document.getElementById('layer-control');
      if (!control) return;
      const shouldOpen = open == null ? !control.classList.contains('expanded') : !!open;
      control.classList.toggle('expanded', shouldOpen);
      if (shouldOpen) document.getElementById('basemap-control')?.classList.remove('expanded');
    };

    window.toggleMapLayer = function (layerName, visible) {
      const group = referenceLayerGroups[layerName];
      if (!group) return;
      group.forEach(layer => { layer.visible = !!visible; });
      setStatus((referenceLayerLabels[layerName] || layerName) + (visible ? ' shown.' : ' hidden.'), true);
      updateAttribution();
    };

    function resolveParcelNumber(attrs) {
      if (!attrs) return '';
      return attrs[pf.parcelNumber] || attrs.geo_id || attrs.GEO_ID || attrs.PARCEL || attrs.PIN || attrs.APN || '';
    }

    function populateInfoPanel(attrs) {
      // Parcel attributes are merged into innerHTML below, so every value
      // that originates from the parcel service must pass through escapeHtml.
      // The local `f` helper combines fmt() (display formatting + fallback)
      // with escapeHtml so the rest of this function can use bare ${f(...)}
      // in template literals safely.
      const escapeHtml = v => String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
      const f = (v, fallback) => escapeHtml(fmt(v, fallback));
      const fmtSetback = v => {
        const s = v == null ? '' : String(v).trim();
        return s && s !== '0' && s.toLowerCase() !== 'null' ? escapeHtml(s) + ' ft' : '—';
      };
      const zoning = f(attrs[pf.zoningAbbrev]) !== '—'
        ? f(attrs[pf.zoningAbbrev]) + (f(attrs[pf.zoningName]) !== '—' ? ' – ' + f(attrs[pf.zoningName]) : '')
        : f(attrs[pf.zoningName]);
      const acreage = f(attrs[pf.acreage]) !== '—' && !Number.isNaN(parseFloat(attrs[pf.acreage]))
        ? parseFloat(attrs[pf.acreage]).toFixed(2) + ' ac'
        : '—';

      document.getElementById('ip-basic').innerHTML = `
        <div class="ip-row"><span class="ip-label">Parcel Number</span><span class="ip-value">${f(resolveParcelNumber(attrs))}</span></div>
        <div class="ip-row"><span class="ip-label">Site Address</span><span class="ip-value">${f(attrs[pf.siteAddress])}</span></div>
        <div class="ip-row"><span class="ip-label">Owner</span><span class="ip-value">${f(attrs[pf.ownerName])}</span></div>
        <div class="ip-row"><span class="ip-label">Area</span><span class="ip-value">${acreage}</span></div>
        <div class="ip-row"><span class="ip-label">Zoning</span><span class="ip-value">${zoning}</span></div>
        <div class="ip-row"><span class="ip-label">Front Setback</span><span class="ip-value">${fmtSetback(attrs[pf.setbackFront])}</span></div>
        <div class="ip-row"><span class="ip-label">Side Setback</span><span class="ip-value">${fmtSetback(attrs[pf.setbackSide])}</span></div>
        <div class="ip-row"><span class="ip-label">Rear Setback</span><span class="ip-value">${fmtSetback(attrs[pf.setbackRear])}</span></div>
        <div class="ip-row"><span class="ip-label">Setback Note</span><span class="ip-value" style="white-space:pre-line;">${f(attrs[pf.setbackNote]) !== '—' ? f(attrs[pf.setbackNote]).replace(/\s*(\(\d+\))/g, '\n$1').trim() : '—'}</span></div>`;

      const caFields = [
        { label:'Flood Hazard Risk', key:pf.caFloodRisk },
        { label:'Flood Hazard Zone', key:pf.caFloodZone },
        { label:'CARA High Recharge Vulnerability', key:pf.caCaraHigh },
        { label:'CARA Moderate Recharge Vulnerability', key:pf.caCaraMod },
        { label:'Ferruginous Hawk Habitat', key:pf.caHawkHab },
        { label:'Neotropical Migrant Songbird Habitat', key:pf.caSongbird },
        { label:'Wintering Birds of Prey Habitat', key:pf.caWinterBirds },
        { label:'Shrubsteppe Habitat', key:pf.caShrubsteppe },
        { label:'Slope / Erosion Hazard', key:pf.caErosion },
        { label:'Faults', key:pf.caFaults },
        { label:'Liquefaction', key:pf.caLiquefaction },
        { label:'Wetlands', key:pf.caWetland },
        { label:'Riparian Buffer', key:pf.caRipName, extra:pf.caRipBuffer }
      ];
      const caHead = document.getElementById('ip-ca-head');
      const caBody = document.getElementById('ip-ca');
      caHead.style.display = '';
      caBody.style.display = '';
      caBody.innerHTML = caFields.map(ca => {
        let val = f(attrs[ca.key], 'NO');
        if (ca.extra) {
          const extraVal = f(attrs[ca.extra]);
          if (extraVal !== '—') val += ' (' + extraVal + ' ft)';
        }
        const isYes = val !== 'NO' && val !== '—';
        const isNo = val === 'NO';
        const valColor = isYes ? '#b33' : isNo ? '#2a7a2a' : '#1a1f2e';
        return `<div class="ca-item"><span class="ip-label">${ca.label}</span><span class="ip-value" style="color:${valColor};">${val}</span></div>`;
      }).join('');
    }

    /* ── Parcel Search / Active Parcel Workflow ──────────────────────────────
       Isolated core search system carried over from the earlier full build.
       This section intentionally owns only parcel lookup, selected-parcel state,
       County highlight behavior, URL geo launch behavior, and right-panel updates.
       Future drawing tools should read selectedParcelGeometry/currentParcelAttrs
       from this workflow, but tool-specific behavior should be added elsewhere.
    */
    function getParcelDisplayValues(attrs) {
      return {
        parcel: fmt(resolveParcelNumber(attrs), '—'),
        address: fmt(attrs && attrs[pf.siteAddress], 'Address not on file'),
        owner: fmt(attrs && attrs[pf.ownerName], '')
      };
    }

    function clearParcelSearchWidget() {
      if (!parcelSearch) return;
      setTimeout(() => {
        try {
          if (parcelSearch.resultGraphics) parcelSearch.resultGraphics.removeAll();
          if (typeof parcelSearch.clear === 'function') parcelSearch.clear();
        } catch (e) {}
        try {
          if (parcelSearch.viewModel) {
            parcelSearch.viewModel.searchTerm = '';
            if (parcelSearch.viewModel.highlightHandle) {
              parcelSearch.viewModel.highlightHandle.remove();
              parcelSearch.viewModel.highlightHandle = null;
            }
          }
        } catch (e) {}
        try {
          const input = document.querySelector('#header-search .esri-search__input');
          if (input) {
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeSetter.call(input, '');
            input.dispatchEvent(new Event('input', { bubbles:true }));
          }
        } catch (e) {}
      }, 100);
    }

    function setActiveParcel(feature, options = {}) {
      if (!feature || !feature.geometry || !feature.attributes) {
        return Promise.reject(new Error('Invalid parcel feature.'));
      }

      const attrs = feature.attributes || {};
      currentParcelAttrs = attrs;
      selectedParcelGeometry = feature.geometry || null;

      highlightLayer.removeAll();
      if (selectedParcelGeometry) {
        highlightLayer.add(new Graphic({
          geometry: selectedParcelGeometry,
          symbol: {
            type: 'simple-fill',
            color: [0, 0, 0, 0],
            outline: { type:'simple-line', color:[230,184,0,1], width:3 }
          }
        }));
      }

      populateInfoPanel(attrs);
      const display = getParcelDisplayValues(attrs);
      setStatus(display.parcel && display.parcel !== '—' ? 'Loaded parcel ' + display.parcel + '.' : 'Loaded parcel.', true);

      if (options.skipZoom || options.skipGoTo || !selectedParcelGeometry || !selectedParcelGeometry.extent) {
        return Promise.resolve(feature);
      }

      return view.goTo(selectedParcelGeometry.extent.expand(1.18), { duration:800 })
        .catch(() => {})
        .then(() => feature);
    }

    function loadParcelByGeo(geoId) {
      const cleanGeo = String(geoId || '').trim();
      if (!cleanGeo) return Promise.reject(new Error('No parcel number provided.'));

      const parcelField = pf.parcelNumber || 'geo_id';
      setStatus('Querying parcel ' + cleanGeo + '...', true);

      return parcelLayer.queryFeatures({
        where: parcelField + " = '" + cleanGeo.replace(/'/g, "''") + "'",
        outFields: ['*'],
        returnGeometry: true,
        outSpatialReference: view.spatialReference
      }).then(result => {
        if (!result.features || !result.features.length) throw new Error('Parcel not found.');
        return setActiveParcel(result.features[0]);
      }).catch(err => {
        console.error(err);
        setStatus('Parcel search failed.', false);
        throw err;
      });
    }

    function fetchFeatureInViewSpatialReference(feature) {
      const oidField = parcelLayer.objectIdField;
      const oid = feature && feature.attributes && oidField ? feature.attributes[oidField] : null;
      if (oid == null) return Promise.resolve(feature);

      return parcelLayer.queryFeatures({
        objectIds: [oid],
        outFields: ['*'],
        returnGeometry: true,
        outSpatialReference: view.spatialReference
      }).then(result => {
        return (result.features && result.features[0]) ? result.features[0] : feature;
      }).catch(() => feature);
    }

    function blockSearchEnterAutoSelect() {
      const attach = () => {
        const input = document.querySelector('#header-search .esri-search__input');
        if (!input || input.__sitePlanEnterBlocked) return false;
        input.__sitePlanEnterBlocked = true;
        input.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') {
            e.stopImmediatePropagation();
            e.preventDefault();
            setStatus('Select a parcel from the dropdown suggestions.', true);
          }
        }, true);
        return true;
      };

      if (attach()) return;
      const observer = new MutationObserver(() => {
        if (attach()) observer.disconnect();
      });
      observer.observe(document.body, { childList:true, subtree:true });
    }

    function initParcelSearch() {
      const searchFields = [pf.parcelNumber, pf.siteAddress].filter(Boolean);
      if (!searchFields.length) return;

      parcelSearch = new Search({
        view,
        container: 'header-search',
        includeDefaultSources: false,
        searchAllEnabled: false,
        popupEnabled: false,
        resultGraphicEnabled: false,
        locationEnabled: false,
        allPlaceholder: 'Search by parcel number or address',
        suggestionsEnabled: true,
        sources: [{
          layer: parcelLayer,
          name: 'Parcels',
          placeholder: 'Search by parcel number or address',
          searchFields,
          displayField: pf.siteAddress || pf.parcelNumber || searchFields[0],
          suggestionTemplate: (pf.parcelNumber && pf.siteAddress)
            ? '{' + pf.parcelNumber + '}, {' + pf.siteAddress + '}'
            : '{' + searchFields[0] + '}',
          exactMatch: false,
          outFields: ['*'],
          maxResults: 8,
          maxSuggestions: 8,
          minSuggestCharacters: 1
        }]
      });

      parcelSearch.on('select-result', function(event) {
        const feature = event.result && event.result.feature;
        if (!feature) return;

        setStatus('Loading selected parcel...', true);
        fetchFeatureInViewSpatialReference(feature)
          .then(setActiveParcel)
          .then(() => {
            clearParcelSearchWidget();
            setStatus('Parcel loaded.', true);
          })
          .catch(err => {
            console.error(err);
            setStatus('Error loading selected parcel.', false);
          });
      });

      blockSearchEnterAutoSelect();
    }

    function setCountyHomeExtent() {
      return parcelLayer.when(() => {
        const countyExtent = parcelLayer.fullExtent;
        if (countyExtent) {
          const target = countyExtent.expand(1.02);
          home.viewpoint = new Viewpoint({ targetGeometry: target });
          if (!geoParam) view.goTo(target, { duration:0 }).catch(() => {});
        }
      });
    }

    window.printPlan = function () {
      alert('Print / Save PDF is temporarily disabled while the Site Plan Builder is being rebuilt.');
    };

    function openClearAllModal() {
      const modal = document.getElementById('clear-modal');
      if (!modal) return;
      modal.classList.add('visible');
      modal.setAttribute('aria-hidden', 'false');
    }

    function closeClearAllModal() {
      const modal = document.getElementById('clear-modal');
      if (!modal) return;
      modal.classList.remove('visible');
      modal.setAttribute('aria-hidden', 'true');
    }

    function performClearAll() {
      try { if (sketch && sketch.state !== 'idle') sketch.cancel(); } catch (err) {}
      try { if (measureSketch && measureSketch.state !== 'idle') measureSketch.cancel(); } catch (err) {}
      // Fire deleted callbacks for each drawn graphic so tool files can run
      // their cleanup (children, parented overlays, etc.) before the layer
      // is wiped. Snapshot first so callbacks can't mutate the iteration.
      drawLayer.graphics.toArray().forEach(fireGraphicDeleted);
      drawLayer.removeAll();
      labelLayer.removeAll();
      measureLayer.removeAll();
      previewLayer.removeAll();
      sideLabelMap.clear();
      activeMeasureMode = null;
      hideSelectionToolbar();
      updateMeasureButtons();
      setStatus('Drawings cleared.', true);
    }

    function confirmClearAllModal() {
      closeClearAllModal();
      performClearAll();
    }

    window.openClearAllModal = openClearAllModal;
    window.closeClearAllModal = closeClearAllModal;
    window.confirmClearAllModal = confirmClearAllModal;
    window.clearAll = openClearAllModal;

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeClearAllModal();
    });

    // ── Tool event subscriptions ──────────────────────────────
    // Tool files (drainfield, D-box, etc.) subscribe to these via the
    // SitePlanRuntime API to react when a graphic they care about is
    // created, updated, or deleted. Each callback receives the affected
    // graphic. Errors in one subscriber don't break the others.
    const graphicCreatedCallbacks = [];
    const graphicUpdatedCallbacks = [];
    const graphicDeletedCallbacks = [];

    function fireGraphicCreated(graphic) {
      if (!graphic) return;
      graphicCreatedCallbacks.forEach(cb => {
        try { cb(graphic); }
        catch (err) { console.error('onGraphicCreated callback failed:', err); }
      });
    }

    function fireGraphicUpdated(graphic, sketchEvent) {
      if (!graphic) return;
      graphicUpdatedCallbacks.forEach(cb => {
        try { cb(graphic, sketchEvent); }
        catch (err) { console.error('onGraphicUpdated callback failed:', err); }
      });
    }

    function fireGraphicDeleted(graphic) {
      if (!graphic) return;
      graphicDeletedCallbacks.forEach(cb => {
        try { cb(graphic); }
        catch (err) { console.error('onGraphicDeleted callback failed:', err); }
      });
    }

    window.SitePlanRuntime = {
      map,
      view,
      Graphic,
      geometryEngine,
      GraphicsLayer,
      parcelLayer,
      highlightLayer,
      drawLayer,
      labelLayer,
      measureLayer,
      previewLayer,
      sketch,
      measureSketch,
      get activeParcelGeometry() { return selectedParcelGeometry; },
      get activeParcelAttributes() { return currentParcelAttrs; },
      clearDrawings: performClearAll,
      clearTemporaryMeasurements,
      clearSelection,
      selectGraphic,
      refreshSnapSources,
      refreshSideLabelsForGraphic,
      removeSideLabelsForGraphic,
      onGraphicCreated(callback) {
        if (typeof callback === 'function') graphicCreatedCallbacks.push(callback);
      },
      onGraphicUpdated(callback) {
        if (typeof callback === 'function') graphicUpdatedCallbacks.push(callback);
      },
      onGraphicDeleted(callback) {
        if (typeof callback === 'function') graphicDeletedCallbacks.push(callback);
      },
      measurements: {
        formatDistance,
        formatArea,
        measurementTextForGeometry,
        measureLabelAnchor,
        createMeasureLabel,
        createOrUpdateMeasureLabelForGraphic,
        removeMeasureLabelForGraphic,
        clearTemporaryMeasurements,
        clearLiveMeasurePreview
      },
      registerDrawableGraphic(graphic) {
        if (!graphic) return null;
        assignGraphicId(graphic);
        drawLayer.add(graphic);
        refreshSnapSources();
        fireGraphicCreated(graphic);
        return graphic;
      },
      registerDrawableGraphics(graphics) {
        if (!Array.isArray(graphics)) return [];
        const valid = graphics.filter(Boolean);
        valid.forEach(assignGraphicId);
        if (valid.length) drawLayer.addMany(valid);
        refreshSnapSources();
        valid.forEach(fireGraphicCreated);
        return valid;
      }
    };

    // Resolve the ready-promise and broadcast a 'siteplan:ready' event so
    // tool files (and any other listeners) can begin running. Both signals
    // carry the runtime as their value.
    resolveRuntimeReady(window.SitePlanRuntime);
    window.dispatchEvent(new CustomEvent('siteplan:ready', {
      detail: window.SitePlanRuntime
    }));

    refreshBasemapButtons();
    updateAttribution();

    Promise.all([view.when(), parcelLayer.when()]).then(() => {
      initParcelSearch();
      return setCountyHomeExtent();
    }).then(() => {
      if (geoParam) return loadParcelByGeo(geoParam);
      setStatus('Map ready. Search for a parcel to begin.', true);
    }).catch(err => {
      console.error(err);
      setStatus('Map failed to initialize.', false);
    }).finally(() => {
      document.getElementById('loading')?.classList.add('hidden');
      setTimeout(readNativeAttribution, 1200);
    });
  });
})();
