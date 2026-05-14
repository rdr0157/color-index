// Site Plan Builder V149 - print placeholder module.
// The full print system remains intentionally disabled during tool development.
(function () {
  function helpers() {
    return (window.SitePlan && window.SitePlan.helpers) || {};
  }

  window.setPrintExtent = function setPrintExtent() {
    // Print extent controls are intentionally inactive while print is disabled.
  };

  window.printPlan = function printPlan() {
    const h = helpers();
    if (typeof h.hideSelectionToolbar === 'function') h.hideSelectionToolbar();

    const message = 'Print / Save PDF is temporarily disabled while the Site Plan Builder is under active development.';
    if (typeof h.setStatus === 'function') h.setStatus(message, false);

    alert(message + '\n\nDrawing, editing, parcel search, map layers, and attribution can still be tested. Print output will be restored after the drawing/tool system stabilizes.');
  };
})();
