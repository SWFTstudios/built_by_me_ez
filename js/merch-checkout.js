/**
 * Merch checkout — creates a Stripe Checkout Session via the package-booking Worker.
 *
 * Requires on the page:
 *   <body data-merch-color="black|brown|blue">
 *   <script>var WORKER_URL = 'https://package-booking.elombe.workers.dev';</script>
 */
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var form = document.querySelector('form.form-2');
    if (!form) return;

    var colorSlug = (document.body.getAttribute('data-merch-color') || '').toLowerCase().trim();
    if (!colorSlug) return;

    var submitBtn = form.querySelector('input[type="submit"], button[type="submit"]');
    var sizeError = document.getElementById('merch-size-error');
    var checkoutError = document.getElementById('merch-checkout-error');
    var webflowFail = document.querySelector('.w-form-fail');

    if (webflowFail) {
      webflowFail.style.display = 'none';
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      e.stopImmediatePropagation();

      var nameInput = form.querySelector('input[name="Name"], input[name="name"]');
      var emailInput = form.querySelector('input[name="Email"], input[name="email"], input[type="email"]');
      var sizeInput = form.querySelector('input[name="size"]:checked');

      var name = nameInput ? nameInput.value.trim() : '';
      var email = emailInput ? emailInput.value.trim().toLowerCase() : '';
      var size = sizeInput ? normalizeSizeValue(sizeInput.value) : '';

      clearCheckoutError();

      if (sizeError) {
        sizeError.style.display = size ? 'none' : 'block';
      }
      if (!size) {
        return;
      }

      var workerUrl = (typeof WORKER_URL !== 'undefined' ? WORKER_URL : '').replace(/\/$/, '');
      if (!workerUrl || workerUrl === 'WORKER_URL_PLACEHOLDER') {
        showCheckoutError('Checkout is not configured yet. Please try again later.');
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.dataset.originalValue = submitBtn.value || submitBtn.textContent;
        if (submitBtn.tagName === 'INPUT') {
          submitBtn.value = 'Please wait...';
        } else {
          submitBtn.textContent = 'Please wait...';
        }
      }

      fetch(workerUrl + '/create-merch-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name,
          email: email,
          size: size,
          colorSlug: colorSlug,
        }),
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data.ok && data.url) {
            window.location.href = data.url;
            return;
          }
          throw new Error(data.error || 'Unable to start checkout');
        })
        .catch(function (err) {
          showCheckoutError(err.message || 'Something went wrong. Please try again.');
          resetSubmit();
        });

      function resetSubmit() {
        if (!submitBtn) return;
        submitBtn.disabled = false;
        if (submitBtn.tagName === 'INPUT') {
          submitBtn.value = submitBtn.dataset.originalValue || 'Next';
        } else {
          submitBtn.textContent = submitBtn.dataset.originalValue || 'Next';
        }
      }

      function showCheckoutError(message) {
        if (checkoutError) {
          checkoutError.textContent = message;
          checkoutError.style.display = 'block';
          checkoutError.focus();
          return;
        }
        alert(message);
      }

      function clearCheckoutError() {
        if (checkoutError) {
          checkoutError.style.display = 'none';
        }
      }
    }, true);
  });

  function normalizeSizeValue(raw) {
    var value = String(raw || '').trim().toUpperCase();
    if (value === 'LARGE') return 'L';
    if (value.indexOf('XS') === 0) return 'XS';
    if (value.indexOf('XL') === 0) return 'XL';
    if (value.indexOf('S') === 0) return 'S';
    if (value.indexOf('M') === 0) return 'M';
    if (value.indexOf('L') === 0) return 'L';
    return value;
  }
})();
