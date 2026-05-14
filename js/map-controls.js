// Site Plan Builder — map-controls.js
// Handles basemap buttons and optional reference-layer toggles.
(function () {
  window.SitePlanMapControls = {
    init: function (ctx) {
      ctx = ctx || {};
      const map = ctx.map;
      const referenceLayerGroups = ctx.referenceLayerGroups || {};
      const referenceLayerLabels = ctx.referenceLayerLabels || {};
      const setStatus = ctx.setStatus || function () {};
      const updateSiteAttribution = ctx.updateSiteAttribution || function () {};
      const getActiveBasemapId = ctx.getActiveBasemapId || function () { return 'gray-vector'; };
      const setActiveBasemapId = ctx.setActiveBasemapId || function () {};

      function basemapThumbSvg(id) {
        if (id === 'satellite') {
          return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect width="64" height="64" fill="#2d4a1e"/>
            <rect x="0" y="0" width="32" height="32" fill="#3a5c28" opacity=".8"/>
            <rect x="32" y="32" width="32" height="32" fill="#3a5c28" opacity=".8"/>
            <rect x="14" y="20" width="18" height="10" fill="#8ba888" opacity=".6"/>
            <rect x="36" y="38" width="12" height="8" fill="#8ba888" opacity=".6"/>
            <path d="M0 40 Q16 30 32 38 Q48 46 64 36" fill="none" stroke="#5b8cd4" stroke-width="2" opacity=".7"/>
          </svg>`;
        }
        if (id === 'topo-vector') {
          return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect width="64" height="64" fill="#f0ebe0"/>
            <ellipse cx="32" cy="36" rx="26" ry="16" fill="none" stroke="#b8a882" stroke-width="1.5"/>
            <ellipse cx="32" cy="36" rx="18" ry="10" fill="none" stroke="#b8a882" stroke-width="1.5"/>
            <ellipse cx="32" cy="36" rx="10" ry="5" fill="none" stroke="#b8a882" stroke-width="1.5"/>
            <ellipse cx="32" cy="36" rx="4" ry="2" fill="#b8a882"/>
          </svg>`;
        }
        if (id === 'gray-vector') {
          return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect width="64" height="64" fill="#f0ede7"/>
            <line x1="0" y1="32" x2="64" y2="32" stroke="#ccc9c2" stroke-width="2.5"/>
            <line x1="32" y1="0" x2="32" y2="64" stroke="#ccc9c2" stroke-width="1.5"/>
            <line x1="0" y1="20" x2="64" y2="20" stroke="#ccc9c2" stroke-width="1"/>
            <line x1="0" y1="48" x2="64" y2="48" stroke="#ccc9c2" stroke-width="1"/>
            <line x1="20" y1="0" x2="20" y2="64" stroke="#ccc9c2" stroke-width="1"/>
            <line x1="48" y1="0" x2="48" y2="64" stroke="#ccc9c2" stroke-width="1"/>
          </svg>`;
        }
        return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect width="64" height="64" fill="#e8e0d0"/>
          <rect x="0" y="28" width="64" height="8" fill="#fff" opacity=".7"/>
          <rect x="24" y="0" width="6" height="64" fill="#fff" opacity=".5"/>
          <rect x="0" y="28" width="64" height="4" fill="#c9a96e" opacity=".6"/>
          <circle cx="32" cy="22" r="6" fill="#c0392b" opacity=".7"/>
        </svg>`;
      }

      function updateBasemapUI() {
        const activeBasemapId = getActiveBasemapId();
        const optionMap = {
          'streets-vector': 'bm-option-streets',
          'topo-vector': 'bm-option-topo',
          'gray-vector': 'bm-option-gray',
          'satellite': 'bm-option-imagery'
        };
        document.querySelectorAll('.basemap-option').forEach(btn => btn.classList.remove('active'));
        const activeOption = document.getElementById(optionMap[activeBasemapId] || 'bm-option-streets');
        if (activeOption) activeOption.classList.add('active');

        const mainToggle = document.getElementById('bm-basemap');
        if (mainToggle) mainToggle.classList.remove('active');

        const currentLabel = document.getElementById('bm-current-label');
        if (currentLabel) currentLabel.textContent = 'Basemap';

        const currentThumb = document.getElementById('bm-current-thumb');
        if (currentThumb) currentThumb.innerHTML = basemapThumbSvg(activeBasemapId);
      }

      window.switchBasemap = function (id, btn) {
        try {
          setActiveBasemapId(id);
          map.basemap = id;
          updateBasemapUI();
          updateSiteAttribution();
          const label = btn && btn.title ? btn.title :
            (id === 'satellite' ? 'Imagery' : id === 'topo-vector' ? 'Topo' : id === 'gray-vector' ? 'Gray Canvas' : 'Streets');
          setStatus('Basemap: ' + label, true);
        } catch (err) {
          console.error(err);
          setStatus('Unable to switch basemap.', false);
        }
      };

      window.toggleBasemapPanel = function (force) {
        const control = document.getElementById('basemap-control');
        if (!control) return;
        const open = typeof force === 'boolean' ? force : !control.classList.contains('expanded');
        control.classList.toggle('expanded', open);
        if (open) {
          const layerControl = document.getElementById('layer-control');
          if (layerControl) layerControl.classList.remove('expanded');
        }
      };

      window.toggleLayerPanel = function (force) {
        const control = document.getElementById('layer-control');
        if (!control) return;
        const open = typeof force === 'boolean' ? force : !control.classList.contains('expanded');
        control.classList.toggle('expanded', open);
        if (open) {
          const basemapControl = document.getElementById('basemap-control');
          if (basemapControl) basemapControl.classList.remove('expanded');
        }
      };

      window.toggleMapLayer = function (layerName, visible) {
        const group = referenceLayerGroups[layerName];
        if (!group) return;
        const isVisible = !!visible;
        group.forEach(layer => { layer.visible = isVisible; });
        updateSiteAttribution();
        const label = referenceLayerLabels[layerName] || 'Layer';
        setStatus(label + (isVisible ? ' layer on.' : ' layer off.'), true);
      };

      updateBasemapUI();

      return {
        updateBasemapUI: updateBasemapUI
      };
    }
  };
}());
