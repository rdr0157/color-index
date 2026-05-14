// Site Plan Builder — attribution.js
// Handles the map-anchored credits/acknowledgment strip.
(function () {
  window.SitePlanAttribution = {
    init: function (ctx) {
      ctx = ctx || {};
      const map = ctx.map;
      const view = ctx.view;
      const Attribution = ctx.Attribution;
      const referenceLayerGroups = ctx.referenceLayerGroups || {};
      const mapWrap = ctx.mapWrap || document.getElementById('map-wrap');
      const getActiveBasemapId = ctx.getActiveBasemapId || function () { return 'gray-vector'; };

      const basemapCreditFallbackLabels = {
        'streets-vector': 'Esri Streets basemap',
        'topo-vector': 'Esri Topographic basemap',
        'gray-vector': 'Esri Gray Canvas basemap',
        'satellite': 'Esri Imagery basemap'
      };

      const referenceLayerCreditLabels = {
        contours: 'Washington State DNR (Contours)',
        liquefaction: null,
        riparian: null,
        wetlands: 'US FWS National Wetlands Inventory (NWI)',
        cara: null,
        flood: 'FEMA Flood Hazard Areas'
      };

      let nativeBasemapCredits = '';

      const siteAttributionControl = document.createElement('div');
      siteAttributionControl.className = 'esri-component esri-attribution site-attribution site-attribution-map-anchored';
      siteAttributionControl.setAttribute('role', 'button');
      siteAttributionControl.setAttribute('tabindex', '0');
      siteAttributionControl.setAttribute('aria-expanded', 'false');
      siteAttributionControl.title = 'Click to expand or collapse data credits';
      siteAttributionControl.innerHTML = '<span class="esri-attribution__sources" id="site-attribution-sources"></span>';
      const siteAttributionSources = siteAttributionControl.querySelector('#site-attribution-sources');

      function normalizeAttributionText(text) {
        return String(text || '')
          .replace(/\s+/g, ' ')
          .replace(/^Powered by Esri\s*\|?\s*/i, '')
          .replace(/^Powered by Esri\s*/i, '')
          .trim();
      }

      function getVisibleNativeAttributionText(nativeAttributionReader) {
        if (!nativeAttributionReader) return '';
        const sourceEl = nativeAttributionReader.querySelector('.esri-attribution__sources') ||
          nativeAttributionReader.querySelector('.esri-attribution');
        return normalizeAttributionText(sourceEl ? sourceEl.textContent : nativeAttributionReader.textContent);
      }

      function activeReferenceLayerCreditLabels() {
        return Object.keys(referenceLayerGroups)
          .filter(function (key) {
            const group = referenceLayerGroups[key] || [];
            return group.some(function (layer) { return !!layer.visible; });
          })
          .map(function (key) {
            return Object.prototype.hasOwnProperty.call(referenceLayerCreditLabels, key)
              ? referenceLayerCreditLabels[key]
              : null;
          })
          .filter(function (label) { return !!label; });
      }

      function appendAttributionSeparator(target) {
        target.appendChild(document.createTextNode(' | '));
      }

      function appendAttributionText(target, text) {
        target.appendChild(document.createTextNode(String(text || '')));
      }

      function updateSiteAttribution() {
        if (!siteAttributionSources) return;
        const activeBasemapId = getActiveBasemapId();
        const basemapCredit = nativeBasemapCredits ||
          basemapCreditFallbackLabels[activeBasemapId] ||
          activeBasemapId ||
          'Esri basemap';

        siteAttributionSources.replaceChildren();

        const esriLink = document.createElement('a');
        esriLink.href = 'https://www.esri.com/en-us/home';
        esriLink.target = '_blank';
        esriLink.rel = 'noopener noreferrer';
        esriLink.className = 'site-attribution-link';
        esriLink.textContent = 'Powered by Esri';
        esriLink.title = 'Open Esri website';
        siteAttributionSources.appendChild(esriLink);

        [basemapCredit, 'Walla Walla County'].forEach(function (part) {
          if (!part) return;
          appendAttributionSeparator(siteAttributionSources);
          appendAttributionText(siteAttributionSources, part);
        });

        activeReferenceLayerCreditLabels().forEach(function (label) {
          appendAttributionSeparator(siteAttributionSources);
          appendAttributionText(siteAttributionSources, label);
        });
      }

      function toggleSiteAttribution(open) {
        const nextOpen = typeof open === 'boolean'
          ? open
          : !siteAttributionControl.classList.contains('esri-attribution--open');
        siteAttributionControl.classList.toggle('esri-attribution--open', nextOpen);
        siteAttributionSources.classList.toggle('esri-attribution__sources--open', nextOpen);
        siteAttributionControl.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
      }

      siteAttributionControl.addEventListener('click', function (event) {
        if (event.target && event.target.closest && event.target.closest('.site-attribution-link')) {
          event.stopPropagation();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        toggleSiteAttribution();
      });
      siteAttributionControl.addEventListener('keydown', function (event) {
        if (event.target && event.target.closest && event.target.closest('.site-attribution-link')) {
          return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggleSiteAttribution();
        }
      });

      if (mapWrap) {
        mapWrap.appendChild(siteAttributionControl);
      }

      const nativeAttributionReader = document.createElement('div');
      nativeAttributionReader.id = 'native-attribution-reader';
      nativeAttributionReader.setAttribute('aria-hidden', 'true');
      if (mapWrap) {
        mapWrap.appendChild(nativeAttributionReader);
      }

      function refreshNativeBasemapCredits() {
        const nextText = getVisibleNativeAttributionText(nativeAttributionReader);
        if (nextText && nextText !== nativeBasemapCredits) {
          nativeBasemapCredits = nextText;
          updateSiteAttribution();
        } else if (!nextText) {
          updateSiteAttribution();
        }
      }

      try {
        const nativeAttributionWidget = new Attribution({
          view: view,
          container: nativeAttributionReader
        });
        window.__sitePlanNativeAttributionWidget = nativeAttributionWidget;
        const attributionObserver = new MutationObserver(function () {
          refreshNativeBasemapCredits();
        });
        attributionObserver.observe(nativeAttributionReader, {
          childList: true,
          subtree: true,
          characterData: true
        });
        window.__sitePlanAttributionObserver = attributionObserver;
        view.watch('stationary', function (stationary) {
          if (stationary) setTimeout(refreshNativeBasemapCredits, 80);
        });
        map.watch('basemap', function () {
          nativeBasemapCredits = '';
          setTimeout(refreshNativeBasemapCredits, 250);
          setTimeout(refreshNativeBasemapCredits, 900);
        });
        setTimeout(refreshNativeBasemapCredits, 250);
        setTimeout(refreshNativeBasemapCredits, 1200);
      } catch (err) {
        console.warn('Native attribution reader unavailable; using fallback credits.', err);
        updateSiteAttribution();
      }
      updateSiteAttribution();

      return {
        update: updateSiteAttribution,
        toggle: toggleSiteAttribution,
        refreshNativeBasemapCredits: refreshNativeBasemapCredits
      };
    }
  };
}());
