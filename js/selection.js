// Site Plan Builder V147 - selection, delete, and clear/cleanup module.
(function () {
  window.SitePlanSelection = window.SitePlanSelection || {};

  window.SitePlanSelection.install = function installSelectionModule(ctx) {
    if (!ctx) throw new Error('SitePlanSelection requires a context object.');

    const drawLayer = ctx.drawLayer;
    const wellLayer = ctx.wellLayer;
    const labelLayer = ctx.labelLayer;
    const measureLayer = ctx.measureLayer;
    const previewLayer = ctx.previewLayer;
    const sketch = ctx.sketch;
    const lineLabelMap = ctx.lineLabelMap;
    const polyEdgeLabelMap = ctx.polyEdgeLabelMap;
    const objectLabelMap = ctx.objectLabelMap;
    const dboxInnerMap = ctx.dboxInnerMap;
    const drainfieldChildDboxMap = ctx.drainfieldChildDboxMap;

    const getCurrentUpdateGraphic = ctx.getCurrentUpdateGraphic;
    const getSelectedToolbarGraphic = ctx.getSelectedToolbarGraphic;
    const sourceLineForHitTarget = ctx.sourceLineForHitTarget;
    const isSelectableDrawGraphic = ctx.isSelectableDrawGraphic;
    const removeLineHitTarget = ctx.removeLineHitTarget;
    const removeLineLabel = ctx.removeLineLabel;
    const removePolygonEdgeLabels = ctx.removePolygonEdgeLabels;
    const removeObjectLabel = ctx.removeObjectLabel;
    const removeSepticLids = ctx.removeSepticLids;
    const hideAllSepticLineHandles = ctx.hideAllSepticLineHandles;
    const lineHitTargetFor = ctx.lineHitTargetFor;
    const hideAllCalloutHandles = ctx.hideAllCalloutHandles;
    const hideSelectionToolbar = ctx.hideSelectionToolbar;
    const hideMeasure = ctx.hideMeasure;
    const scheduleSepticLidDeleteCleanup = ctx.scheduleSepticLidDeleteCleanup;
    const clearCalloutPreview = ctx.clearCalloutPreview;
    const clearLiveMeasurePreview = ctx.clearLiveMeasurePreview;
    const clearMeasureMode = ctx.clearMeasureMode;
    const setStatus = ctx.setStatus;

    function deleteGraphicDirectly(graphic) {
      let g = graphic;
      if (!g) return false;
      if (g.__lineHitTarget) g = sourceLineForHitTarget(g) || g;
      if (!isSelectableDrawGraphic(g)) return false;
      const deletedSepticIds = (g.__isSepticTank || g.__septicId) && g.__septicId ? [g.__septicId] : [];

      removeLineHitTarget(g);
      removeLineLabel(g);
      removePolygonEdgeLabels(g);
      removeObjectLabel(g);
      removeSepticLids(g);

      if (g.__wellId) {
        const wid = g.__wellId;
        drawLayer.graphics.filter(x=>x.__wellId===wid).toArray().forEach(x=>drawLayer.remove(x));
        wellLayer.graphics.filter(x=>x.__wellId===wid).toArray().forEach(x=>wellLayer.remove(x));
        labelLayer.graphics.filter(x=>x.__wellId===wid).toArray().forEach(x=>labelLayer.remove(x));
      } else if (g.__isDrainfield && g.__dfId) {
        const did = g.__dfId;
        labelLayer.graphics.filter(x=>x.__dfId===did).toArray().forEach(x=>labelLayer.remove(x));
        drawLayer.remove(g);
      } else if (g.__septicLineId) {
        const sid = g.__septicLineId;
        hideAllSepticLineHandles();
        drawLayer.graphics.filter(x=>x.__septicLineId===sid).toArray().forEach(x=>drawLayer.remove(x));
        const hit = lineHitTargetFor(g.__septicLineRole === 'leader' ? g : drawLayer.graphics.find(x=>x.__septicLineId===sid&&x.__septicLineRole==='leader'));
        if (hit) drawLayer.remove(hit);
      } else if (g.__calloutId) {
        const cid = g.__calloutId;
        hideAllCalloutHandles();
        drawLayer.graphics.filter(x=>x.__calloutId===cid).toArray().forEach(x=>drawLayer.remove(x));
        labelLayer.graphics.filter(x=>x.__calloutId===cid).toArray().forEach(x=>labelLayer.remove(x));
      } else {
        drawLayer.remove(g);
      }

      scheduleSepticLidDeleteCleanup(deletedSepticIds);
      hideSelectionToolbar();
      hideMeasure();
      setStatus('Deleted.');
      return true;
    }

    window.deleteSelected = function () {
      const current = getCurrentUpdateGraphic();
      if (current && current.__isSepticTank) {
        try { sketch.cancel(); } catch (err) {}
        deleteGraphicDirectly(current);
        return;
      }
      if (sketch.updateGraphics&&sketch.updateGraphics.length) sketch.delete();
      else if (!deleteGraphicDirectly(getSelectedToolbarGraphic ? getSelectedToolbarGraphic() : null)) setStatus('Click an item to select it first.');
    };

    function performClearAll() {
      clearCalloutPreview(); clearLiveMeasurePreview(); hideSelectionToolbar(); hideAllCalloutHandles(); hideAllSepticLineHandles(); sketch.cancel();
      drawLayer.removeAll(); wellLayer.removeAll(); labelLayer.removeAll(); measureLayer.removeAll(); previewLayer.removeAll();
      clearMeasureMode();
      lineLabelMap.clear();
      polyEdgeLabelMap.clear();
      objectLabelMap.clear();
      dboxInnerMap.clear();
      drainfieldChildDboxMap.clear();
      document.getElementById('measure-box').style.display='none';
      setStatus('All items cleared.');
    }

    window.openClearAllModal = function () {
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
      const modal = document.getElementById('clear-modal');
      if (!modal) return;
      modal.classList.remove('visible');
      modal.setAttribute('aria-hidden', 'true');
      setStatus('Clear all cancelled.');
    };

    window.confirmClearAllModal = function () {
      const modal = document.getElementById('clear-modal');
      if (modal) {
        modal.classList.remove('visible');
        modal.setAttribute('aria-hidden', 'true');
      }
      performClearAll();
    };

    window.clearAll = function (skipConfirm) {
      if (skipConfirm) { performClearAll(); return; }
      window.openClearAllModal();
    };

    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      const modal = document.getElementById('clear-modal');
      if (modal && modal.classList.contains('visible')) window.closeClearAllModal();
    });



  };
})();
