/**
 * Lead capture: date-interest calendar + FormSubmit email + Worker save-lead.
 *
 * Per-page setup:
 *   1. Add <script>var WORKER_URL = 'https://package-booking.YOUR.workers.dev';</script>
 *      before this file.
 *   2. Add the .section-lead-capture HTML with data-package-label,
 *      data-package-slug, data-stripe-link attributes.
 */
(function () {
  'use strict';

  var DAYS   = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var DAYS_LONG    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  // ── Helpers ───────────────────────────────────────────────────────────────

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function toIsoDate(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function formatNice(str) {
    var p = str.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return DAYS_LONG[d.getDay()] + ', ' + MONTHS_SHORT[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // ── Calendar picker ───────────────────────────────────────────────────────

  function CalPicker(host) {
    this.host     = host;
    this.selected = [];
    this.today    = toIsoDate(new Date());
    var now       = new Date();
    this.year     = now.getFullYear();
    this.month    = now.getMonth();
    this.onChange = null;
    this._render();
  }

  CalPicker.prototype._render = function () {
    this.host.innerHTML = '';
    var wrap = el('div', 'lead-cal-wrap');

    // Navigation
    var nav  = el('div', 'lead-cal-nav');
    var prev = el('button', 'lead-cal-nav-btn', '← Prev');
    var next = el('button', 'lead-cal-nav-btn', 'Next →');
    prev.type = 'button';
    next.type = 'button';
    var self = this;
    prev.addEventListener('click', function () { self._shift(-1); });
    next.addEventListener('click', function () { self._shift(1); });
    nav.appendChild(prev);
    nav.appendChild(next);
    wrap.appendChild(nav);

    // Two-month layout
    var row = el('div', 'lead-cal-months');
    row.appendChild(this._buildMonth(this.year, this.month));
    var d2 = new Date(this.year, this.month + 1, 1);
    var m2 = el('div', 'lead-cal-month-second');
    m2.appendChild(this._buildMonth(d2.getFullYear(), d2.getMonth()));
    row.appendChild(m2);
    wrap.appendChild(row);

    // Count line
    this._countEl = el('div', 'lead-cal-count', this._countText());
    wrap.appendChild(this._countEl);

    this.host.appendChild(wrap);
  };

  CalPicker.prototype._buildMonth = function (year, month) {
    var self  = this;
    var frame = el('div', 'lead-cal-month');
    frame.appendChild(el('div', 'lead-cal-month-name', MONTHS[month] + ' ' + year));

    var grid = el('div', 'lead-cal-grid');
    DAYS.forEach(function (d) { grid.appendChild(el('span', 'lead-cal-dow', d)); });

    // Blank cells
    var firstDay = new Date(year, month, 1).getDay();
    for (var b = 0; b < firstDay; b++) {
      grid.appendChild(el('span', 'lead-cal-day lead-cal-empty'));
    }

    var total = new Date(year, month + 1, 0).getDate();
    for (var d = 1; d <= total; d++) {
      var ds  = year + '-' + pad(month + 1) + '-' + pad(d);
      var day = el('span', 'lead-cal-day', d);
      if (ds < self.today) {
        day.classList.add('past');
      } else {
        day.dataset.date = ds;
        if (self.selected.indexOf(ds) !== -1) day.classList.add('selected');
        day.addEventListener('click', function (ev) {
          var date = ev.currentTarget.dataset.date;
          var idx  = self.selected.indexOf(date);
          if (idx === -1) {
            self.selected.push(date);
            ev.currentTarget.classList.add('selected');
          } else {
            self.selected.splice(idx, 1);
            ev.currentTarget.classList.remove('selected');
          }
          if (self._countEl) self._countEl.textContent = self._countText();
          if (self.onChange) self.onChange(self.selected.slice());
        });
      }
      grid.appendChild(day);
    }
    frame.appendChild(grid);
    return frame;
  };

  CalPicker.prototype._shift = function (delta) {
    var d    = new Date(this.year, this.month + delta, 1);
    this.year  = d.getFullYear();
    this.month = d.getMonth();
    this._render();
  };

  CalPicker.prototype._countText = function () {
    var n = this.selected.length;
    return n === 0
      ? 'No dates selected — click any day to add one.'
      : n + ' date' + (n !== 1 ? 's' : '') + ' selected';
  };

  // ── Init all .section-lead-capture blocks on the page ─────────────────────

  function init() {
    var sections = document.querySelectorAll('.section-lead-capture');
    if (!sections.length) return;

    sections.forEach(function (section) {
      var pkgLabel  = section.dataset.packageLabel  || '';
      var pkgSlug   = section.dataset.packageSlug   || '';
      var stripeLink= section.dataset.stripeLink    || '#';

      var calHost  = section.querySelector('.lead-cal-host');
      var form     = section.querySelector('.lead-form');
      var datesIn  = section.querySelector('.lead-dates-input');
      var msgEl    = section.querySelector('.lead-msg');
      var btnEl    = section.querySelector('.lead-submit-btn');
      if (!calHost || !form) return;

      var picker = new CalPicker(calHost);
      picker.onChange = function (dates) {
        if (datesIn) datesIn.value = dates.map(formatNice).join(', ');
      };

      form.addEventListener('submit', function (ev) {
        ev.preventDefault();

        var nameVal  = (form.querySelector('[name="name"]')  || {}).value || '';
        var emailVal = (form.querySelector('[name="email"]') || {}).value || '';

        if (!emailVal || emailVal.indexOf('@') === -1) {
          showMsg(msgEl, 'Please enter a valid email address.', 'error');
          return;
        }

        var sorted   = picker.selected.slice().sort();
        var niceList = sorted.map(formatNice);

        btnEl.disabled    = true;
        btnEl.textContent = 'Saving…';

        // ── 1. FormSubmit (fire & forget — works before Worker is deployed) ──
        var fsBody = {
          _subject: 'New potential client — ' + pkgLabel,
          name:     nameVal || 'Not provided',
          email:    emailVal,
          package:  pkgLabel,
          _cc:      emailVal,
          _template:'table',
          _captcha: 'false',
        };
        if (niceList.length) {
          niceList.forEach(function (date, i) {
            fsBody['Preferred date ' + (i + 1)] = date;
          });
        } else {
          fsBody['Preferred dates'] = 'No dates selected';
        }
        var fsP = fetch('https://formsubmit.co/ajax/builtbymeez1@gmail.com', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(fsBody),
        }).catch(function () {});

        // ── 2. Worker /save-lead (Airtable + user confirmation email) ─────────
        var workerUrl = (typeof WORKER_URL !== 'undefined' ? WORKER_URL : '').replace(/\/$/, '');
        var wP = (workerUrl && workerUrl !== 'WORKER_URL_PLACEHOLDER')
          ? fetch(workerUrl + '/save-lead', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name:          nameVal,
                email:         emailVal,
                package_slug:  pkgSlug,
                package_label: pkgLabel,
                ideal_dates:   niceList,
                stripe_link:   stripeLink,
              }),
            }).catch(function () {})
          : Promise.resolve();

        Promise.all([fsP, wP]).then(function () {
          showMsg(msgEl, "Got it! Check your email — we'll follow up soon.", 'success');
          btnEl.textContent = 'Saved!';
          form.reset();
          picker.selected = [];
          picker._render();
        });
      });
    });
  }

  function showMsg(el, text, type) {
    el.textContent = text;
    el.className   = 'lead-msg ' + type;
    el.style.display = '';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
