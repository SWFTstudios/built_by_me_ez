/**
 * Merch checkout — redirects to a Stripe Payment Link for the selected colorway + size.
 *
 * Requires:
 *   <script src="../js/merch-payment-links.js"></script>
 *   body data-merch-color or form input[name="color"]
 */
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var form = document.querySelector('form.form-2');
    if (!form) return;

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

      var emailInput = form.querySelector('input[name="Email"], input[name="email"], input[type="email"]');
      var sizeInput = form.querySelector('input[name="size"]:checked');
      var colorInput = form.querySelector('input[name="color"]:checked');

      var email = emailInput ? emailInput.value.trim().toLowerCase() : '';
      var size = sizeInput ? normalizeSizeValue(sizeInput.value) : '';
      var colorSlug = getColorSlug(colorInput);

      clearCheckoutError();

      if (sizeError) {
        sizeError.style.display = size ? 'none' : 'block';
      }
      if (!size) {
        return;
      }

      if (emailInput && !emailInput.checkValidity()) {
        emailInput.reportValidity();
        return;
      }

      if (typeof MERCH_PAYMENT_LINKS === 'undefined') {
        showCheckoutError('Checkout failed to load. Please refresh the page and try again.');
        return;
      }

      var links = MERCH_PAYMENT_LINKS[colorSlug];
      if (!links) {
        showCheckoutError('Checkout is not configured for this colorway yet.');
        return;
      }

      var baseUrl = links[size];
      if (!baseUrl) {
        showCheckoutError('Checkout is not configured for this size yet.');
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
      }

      window.location.href = buildPaymentUrl(baseUrl, colorSlug, size, email);
    }, true);

    function getColorSlug(colorInput) {
      if (colorInput && colorInput.value) {
        return colorInput.value.toLowerCase().trim();
      }
      return (document.body.getAttribute('data-merch-color') || '').toLowerCase().trim();
    }

    function buildPaymentUrl(baseUrl, color, size, email) {
      var url = new URL(baseUrl);
      url.searchParams.set('client_reference_id', 'logo-tshirt-' + color + '-' + size.toLowerCase());
      if (email) {
        url.searchParams.set('prefilled_email', email);
      }
      return url.toString();
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
