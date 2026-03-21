/**
 * Cal.com inline embed bootstrap (MVP).
 * Set data-cal-link on .cal-embed-host (e.g. "yourname/single-training-session").
 * Optional: data-cal-layout="month_view" | "week_view" | etc.
 *
 * If your Cal.com username is not "builtbymeez", either update each page's data-cal-link
 * or edit the HTML to use your full username/event path from the Cal dashboard.
 */
(function (C, A, L) {
  var p = function (a, ar) {
    a.q.push(ar);
  };
  var d = C.document;
  C.Cal =
    C.Cal ||
    function () {
      var cal = C.Cal;
      var ar = arguments;
      if (!cal.loaded) {
        cal.ns = {};
        cal.q = cal.q || [];
        d.head.appendChild(d.createElement("script")).src = A;
        cal.loaded = true;
      }
      if (ar[0] === L) {
        var api = function () {
          p(api, arguments);
        };
        var namespace = ar[1];
        api.q = [];
        if (typeof namespace === "string") {
          cal.ns[namespace] = api;
        } else {
          p(cal, ar);
        }
        return;
      }
      p(cal, ar);
    };
})(window, "https://app.cal.com/embed/embed.js", "init");

(function () {
  var CAL_ORIGIN = "https://cal.com";

  function initEmbeds() {
    var hosts = document.querySelectorAll(".cal-embed-host[data-cal-link]");
    if (!hosts.length) return;

    Cal("init", { origin: CAL_ORIGIN });

    hosts.forEach(function (el) {
      var link = el.getAttribute("data-cal-link");
      if (!link) return;
      var layout = el.getAttribute("data-cal-layout") || "month_view";
      Cal("inline", {
        elementOrSelector: el,
        calLink: link,
        layout: layout,
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initEmbeds);
  } else {
    initEmbeds();
  }
})();
