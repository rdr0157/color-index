// Site Plan Builder V149 - simple UI/tool placeholder helpers.
(function () {
  const SitePlan = window.SitePlan = window.SitePlan || {};
  SitePlan.ui = SitePlan.ui || {};

  let selectedAccessSurface = 'gravel';

  function helpers() {
    return (window.SitePlan && window.SitePlan.helpers) || {};
  }

  function updateAccessButtons() {
    const gravelBtn = document.getElementById('access-material-gravel');
    const asphaltBtn = document.getElementById('access-material-asphalt');

    if (gravelBtn) {
      gravelBtn.classList.toggle('active', selectedAccessSurface === 'gravel');
      gravelBtn.setAttribute('aria-pressed', selectedAccessSurface === 'gravel' ? 'true' : 'false');
    }
    if (asphaltBtn) {
      asphaltBtn.classList.toggle('active', selectedAccessSurface === 'asphalt');
      asphaltBtn.setAttribute('aria-pressed', selectedAccessSurface === 'asphalt' ? 'true' : 'false');
    }
  }

  window.setAccessSurface = function setAccessSurface(surface) {
    selectedAccessSurface = surface === 'asphalt' ? 'asphalt' : 'gravel';
    SitePlan.ui.selectedAccessSurface = selectedAccessSurface;
    updateAccessButtons();

    const h = helpers();
    if (typeof h.setStatus === 'function') {
      h.setStatus('Access material set to ' + (selectedAccessSurface === 'asphalt' ? 'Asphalt' : 'Gravel') + '.', true);
    }
  };

  window.showToolPlaceholder = function showToolPlaceholder(label, btnId) {
    const h = helpers();
    if (typeof h.cancelAndReset === 'function') {
      h.cancelAndReset(btnId);
    } else if (btnId) {
      document.querySelectorAll('.draw-tool-btn').forEach(btn => btn.classList.remove('active'));
      const btn = document.getElementById(btnId);
      if (btn) btn.classList.add('active');
    }

    const suffix = (label === 'Driveway' || label === 'Culvert')
      ? ' Selected material: ' + (selectedAccessSurface === 'asphalt' ? 'Asphalt' : 'Gravel') + '.'
      : '';
    const message = label + ' tool placeholder. Drawing behavior will be added in a later version.' + suffix;

    if (typeof h.setStatus === 'function') {
      h.setStatus(message, true);
    } else {
      alert(message);
    }
  };

  SitePlan.ui.getAccessSurface = function getAccessSurface() {
    return selectedAccessSurface;
  };

  SitePlan.ui.setAccessSurface = window.setAccessSurface;
  SitePlan.ui.showToolPlaceholder = window.showToolPlaceholder;
})();
