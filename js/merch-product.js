/**
 * Unified logo t-shirt product — one style, three colorways.
 * Syncs gallery, copy, URL, and body data-merch-color for Stripe checkout.
 */
(function () {
  var COLORS = {
    black: {
      label: 'Black',
      image: '../images/Screenshot-2025-05-02-at-5.08.18-PM_1.avif',
      srcset:
        '../images/Screenshot-2025-05-02-at-5.08.18-PM_1Screenshot-2025-05-02-at-5.08.18-PM.avif 500w, ' +
        '../images/Screenshot-2025-05-02-at-5.08.18-PM_1Screenshot-2025-05-02-at-5.08.18-PM.avif 800w, ' +
        '../images/Screenshot-2025-05-02-at-5.08.18-PM_1.avif 1788w',
      alt: 'Built By Me EZ Logo T-Shirt in black',
    },
    brown: {
      label: 'Brown',
      image: '../images/Screenshot-2025-05-02-at-5.08.49-PM_1.avif',
      srcset:
        '../images/Screenshot-2025-05-02-at-5.08.49-PM_1Screenshot-2025-05-02-at-5.08.49-PM.avif 500w, ' +
        '../images/Screenshot-2025-05-02-at-5.08.49-PM_1Screenshot-2025-05-02-at-5.08.49-PM.avif 800w, ' +
        '../images/Screenshot-2025-05-02-at-5.08.49-PM_1.avif 1788w',
      alt: 'Built By Me EZ Logo T-Shirt in brown',
    },
    blue: {
      label: 'Blue',
      image: '../images/Screenshot-2025-04-29-at-7.17.51-PM_1.avif',
      srcset:
        '../images/Screenshot-2025-04-29-at-7.17.51-PM_1Screenshot-2025-04-29-at-7.17.51-PM.avif 500w, ' +
        '../images/Screenshot-2025-04-29-at-7.17.51-PM_1.avif 1720w',
      alt: 'Built By Me EZ Logo T-Shirt in blue',
    },
  };

  document.addEventListener('DOMContentLoaded', function () {
    var page = document.querySelector('[data-merch-product]');
    if (!page) return;

    var galleryImg = document.getElementById('merch-gallery-image');
    var subtitle = document.getElementById('merch-color-label');
    var bentoImg = document.getElementById('merch-bento-image');
    var colorInputs = page.querySelectorAll('input[name="color"]');
    var swatches = page.querySelectorAll('[data-color-swatch]');

    if (!colorInputs.length) return;

    function getInitialColor() {
      var params = new URLSearchParams(window.location.search);
      var fromUrl = (params.get('color') || '').toLowerCase().trim();
      if (COLORS[fromUrl]) return fromUrl;
      return 'black';
    }

    function applyColor(slug, updateUrl) {
      if (!COLORS[slug]) return;
      var data = COLORS[slug];

      document.body.setAttribute('data-merch-color', slug);
      page.setAttribute('data-selected-color', slug);

      if (galleryImg) {
        galleryImg.src = data.image;
        if (data.srcset) {
          galleryImg.srcset = data.srcset;
        } else {
          galleryImg.removeAttribute('srcset');
        }
        galleryImg.alt = data.alt;
      }

      if (bentoImg) {
        bentoImg.src = data.image;
        bentoImg.alt = data.alt;
      }

      if (subtitle) {
        subtitle.textContent = 'Logo T-Shirt — ' + data.label + ' Colorway';
      }

      colorInputs.forEach(function (input) {
        input.checked = input.value === slug;
      });

      swatches.forEach(function (swatch) {
        var active = swatch.getAttribute('data-color-swatch') === slug;
        swatch.classList.toggle('is-active', active);
        swatch.setAttribute('aria-pressed', active ? 'true' : 'false');
      });

      if (updateUrl !== false) {
        var url = new URL(window.location.href);
        url.searchParams.set('color', slug);
        window.history.replaceState({}, '', url.pathname + url.search);
      }

      document.title = 'Built By Me EZ Logo T-Shirt | ' + data.label;
    }

    colorInputs.forEach(function (input) {
      input.addEventListener('change', function () {
        if (input.checked) applyColor(input.value);
      });
    });

    swatches.forEach(function (swatch) {
      swatch.addEventListener('click', function () {
        var slug = swatch.getAttribute('data-color-swatch');
        var input = page.querySelector('input[name="color"][value="' + slug + '"]');
        if (input) {
          input.checked = true;
          applyColor(slug);
        }
      });
    });

    applyColor(getInitialColor(), false);
  });
})();
