// Site Plan Builder V149 - shared runtime/context bridge.
// This lightweight namespace lets future modules access app state through
// SitePlan.context instead of depending on private variables inside app.js.
(function () {
  const root = window.SitePlan = window.SitePlan || {};

  root.version = root.version || 'V149';
  root.config = window.SitePlanConfig || root.config || {};
  root.context = root.context || null;
  root.state = root.state || {};
  root.layers = root.layers || {};
  root.maps = root.maps || {};
  root.helpers = root.helpers || {};
  root.tools = root.tools || {};
  root.ui = root.ui || {};
  root.modules = root.modules || {};

  root.registerAppContext = function registerAppContext(ctx) {
    root.context = ctx || {};
    root.config = (ctx && ctx.config) || root.config || window.SitePlanConfig || {};
    root.layers = (ctx && ctx.layers) || root.layers || {};
    root.maps = (ctx && ctx.maps) || root.maps || {};
    root.state = (ctx && ctx.state) || root.state || {};
    root.helpers = Object.assign(root.helpers || {}, (ctx && ctx.helpers) || {});
    root.view = ctx && ctx.view;
    root.map = ctx && ctx.map;
    root.sketch = ctx && ctx.sketch;
    root.ready = true;
    window.dispatchEvent(new CustomEvent('siteplan:ready', { detail: root }));
    return root;
  };

  root.whenReady = function whenReady(callback) {
    if (root.ready) {
      callback(root);
      return;
    }
    window.addEventListener('siteplan:ready', function onReady() {
      callback(root);
    }, { once: true });
  };
})();
