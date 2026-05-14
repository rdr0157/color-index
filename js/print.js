// Site Plan Builder — print.js
// Temporary print stub. The full print system is intentionally not active during tool development.
(function () {
  const PRINT_DISABLED_MESSAGE = 'Print / Save PDF is temporarily disabled while the Site Plan Builder is under active development.';
  let context = {};

  window.setPrintExtent = function () {
    // Print extent controls are intentionally inactive during active development.
  };

  window.printPlan = function () {
    if (context.hideSelectionToolbar) {
      context.hideSelectionToolbar();
    }
    if (context.setStatus) {
      context.setStatus(PRINT_DISABLED_MESSAGE, false);
    }
    alert(PRINT_DISABLED_MESSAGE + '\n\nDrawing, editing, parcel search, map layers, and attribution can still be tested. Print output will be restored after the drawing/tool system stabilizes.');
  };

  window.SitePlanPrint = {
    init: function (ctx) {
      context = ctx || {};
    }
  };
}());
