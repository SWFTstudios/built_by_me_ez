/**
 * Fixed bottom CTA bar for package pages.
 * Requires body.package-page with data-pay-label, data-stripe-link, data-lead-label.
 */
(function () {
  'use strict';

  var body = document.body;
  if (!body.classList.contains('package-page')) return;

  var payLabel = body.getAttribute('data-pay-label') || 'Pay Now →';
  var stripeLink = body.getAttribute('data-stripe-link') || '';
  var leadLabel = body.getAttribute('data-lead-label') || 'Save My Ideal Dates →';

  var nav = document.createElement('nav');
  nav.className = 'package-sticky-cta';
  nav.setAttribute('aria-label', 'Package actions');

  nav.innerHTML =
    '<a class="package-sticky-btn package-sticky-btn--pay package-sticky-btn--pay-mobile" href="#package-pay">' +
      payLabel +
    '</a>' +
    '<a class="package-sticky-btn package-sticky-btn--pay package-sticky-btn--pay-desktop" href="' +
      stripeLink +
    '" target="_blank" rel="noopener noreferrer">' +
      payLabel +
    '</a>' +
    '<a class="package-sticky-btn package-sticky-btn--lead" href="#package-lead-capture">' +
      leadLabel +
    '</a>';

  body.appendChild(nav);

  function smoothScrollTo(hash) {
    var target = document.querySelector(hash);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  nav.addEventListener('click', function (e) {
    var link = e.target.closest('a[href^="#"]');
    if (!link) return;
    e.preventDefault();
    smoothScrollTo(link.getAttribute('href'));
  });

  var paySection = document.getElementById('package-pay');
  var leadSection = document.getElementById('package-lead-capture');
  var targets = [paySection, leadSection].filter(Boolean);

  if (targets.length && 'IntersectionObserver' in window) {
    var visibleSections = new Set();

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            visibleSections.add(entry.target);
          } else {
            visibleSections.delete(entry.target);
          }
        });
        nav.classList.toggle('is-hidden', visibleSections.size > 0);
      },
      { root: null, threshold: 0.35 }
    );

    targets.forEach(function (el) {
      observer.observe(el);
    });
  }
})();
