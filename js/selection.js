// Site Plan Builder v143 — selection.js
// Handles the delete-selected button and the clear-all modal.
//
// Pattern: this file does NOT receive a snapshot of app state at install
// time. Instead, every function reads from window.SitePlan at the moment it
// runs. window.SitePlan is populated by app.js after the require([...])
// callback completes. If a button is clicked before app.js is ready, the
// functions log a clear warning instead of failing silently.
//
// Required keys on window.SitePlan: see app.js for the full list.

(function () {
  function ctx() {
    if (!window.SitePlan) {
      console.warn('[selection.js] window.SitePlan is not yet initialized. ' +
        'Make sure config.js and app.js have loaded and the map has finished initializing.');
      return null;
    }
    return window.SitePlan;
  }

  // ── Delete a single graphic, cleaning up all its companion graphics ──
  // Mirrors the original sketch.on('delete') cleanup paths from v142.
  function deleteGraphicDirectly(graphic) {
    const c = ctx(); if (!c) return false;
    let g = graphic;
    if (!g) return false;
    if (g.__lineHitTarget) g = c.sourceLineForHitTarget(g) || g;
    if (!c.isSelectableDrawGraphic(g)) return false;
    const deletedSepticIds = (g.__isSepticTank || g.__septicId) && g.__septicId ? [g.__septicId] : [];

    c.removeLineHitTarget(g);
    c.removeLineLabel(g);
    c.removePolygonEdgeLabels(g);
    c.removeObjectLabel(g);
    c.removeSepticLids(g);

    if (g.__wellId) {
      const wid = g.__wellId;
      c.drawLayer.graphics.filter(x => x.__wellId === wid).toArray().forEach(x => c.drawLayer.remove(x));
      c.wellLayer.graphics.filter(x => x.__wellId === wid).toArray().forEach(x => c.wellLayer.remove(x));
      c.labelLayer.graphics.filter(x => x.__wellId === wid).toArray().forEach(x => c.labelLayer.remove(x));
    } else if (g.__isDrainfield && g.__dfId) {
      const did = g.__dfId;
      c.labelLayer.graphics.filter(x => x.__dfId === did).toArray().forEach(x => c.labelLayer.remove(x));
      c.drawLayer.remove(g);
    } else if (g.__septicLineId) {
      const sid = g.__septicLineId;
      c.hideAllSepticLineHandles();
      c.drawLayer.graphics.filter(x => x.__septicLineId === sid).toArray().forEach(x => c.drawLayer.remove(x));
      const leader = g.__septicLineRole === 'leader'
        ? g
        : c.drawLayer.graphics.find(x => x.__septicLineId === sid && x.__septicLineRole === 'leader');
      const hit = c.lineHitTargetFor(leader);
      if (hit) c.drawLayer.remove(hit);
    } else if (g.__calloutId) {
      const cid = g.__calloutId;
      c.hideAllCalloutHandles();
      c.drawLayer.graphics.filter(x => x.__calloutId === cid).toArray().forEach(x => c.drawLayer.remove(x));
      c.labelLayer.graphics.filter(x => x.__calloutId === cid).toArray().forEach(x => c.labelLayer.remove(x));
    } else {
      c.drawLayer.remove(g);
    }

    c.scheduleSepticLidDeleteCleanup(deletedSepticIds);
    c.hideSelectionToolbar();
    c.hideMeasure();
    c.setStatus('Deleted.');
    return true;
  }

  // ── Delete button: top-level entry point used by the floating toolbar ──
  window.deleteSelected = function () {
    const c = ctx(); if (!c) return;
    const current = c.getCurrentUpdateGraphic();
    if (current && current.__isSepticTank) {
      try { c.sketch.cancel(); } catch (err) { /* harmless */ }
      deleteGraphicDirectly(current);
      return;
    }
    if (c.sketch.updateGraphics && c.sketch.updateGraphics.length) {
      c.sketch.delete();
    } else if (!deleteGraphicDirectly(c.selectedToolbarGraphic)) {
      c.setStatus('Click an item to select it first.');
    }
  };

  // ── Clear-all: empties all draw layers and resets state maps ──
  function performClearAll() {
    const c = ctx(); if (!c) return;
    c.clearCalloutPreview();
    c.clearLiveMeasurePreview();
    c.hideSelectionToolbar();
    c.hideAllCalloutHandles();
    c.hideAllSepticLineHandles();
    c.sketch.cancel();
    c.drawLayer.removeAll();
    c.wellLayer.removeAll();
    c.labelLayer.removeAll();
    c.measureLayer.removeAll();
    c.previewLayer.removeAll();
    c.clearMeasureMode();
    c.lineLabelMap.clear();
    c.polyEdgeLabelMap.clear();
    c.objectLabelMap.clear();
    c.dboxInnerMap.clear();
    c.drainfieldChildDboxMap.clear();
    const measureBox = document.getElementById('measure-box');
    if (measureBox) measureBox.style.display = 'none';
    c.setStatus('All items cleared.');
  }

  // ── Modal controls ──
  window.openClearAllModal = function () {
    const c = ctx(); if (!c) return;
    const modal = document.getElementById('clear-modal');
    if (!modal) { performClearAll(); return; }
    modal.classList.add('visible');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => {
      const cancelBtn = modal.querySelector('.clear-modal-btn.cancel');
      if (cancelBtn) cancelBtn.focus();
    }, 0);
  };

  window.closeClearAllModal = function () {
    const c = ctx(); if (!c) return;
    const modal = document.getElementById('clear-modal');
    if (!modal) return;
    modal.classList.remove('visible');
    modal.setAttribute('aria-hidden', 'true');
    c.setStatus('Clear all cancelled.');
  };

  window.confirmClearAllModal = function () {
    const modal = document.getElementById('clear-modal');
    if (modal) {
      modal.classList.remove('visible');
      modal.setAttribute('aria-hidden', 'true');
    }
    performClearAll();
  };

  // ── Header "Clear all" button entry point ──
  window.clearAll = function (skipConfirm) {
    if (skipConfirm) { performClearAll(); return; }
    window.openClearAllModal();
  };

  // ── Escape key dismisses the modal when it's open ──
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape') return;
    const modal = document.getElementById('clear-modal');
    if (modal && modal.classList.contains('visible')) window.closeClearAllModal();
  });
})();
