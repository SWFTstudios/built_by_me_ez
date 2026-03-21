/**
 * Cal.com namespaced inline embed (matches Cal dashboard snippets).
 *
 * Each page: one element with classes `cal-embed-host`, plus:
 *   data-cal-namespace — must match the namespace in your Cal embed (e.g. single-training-session)
 *   data-cal-link      — full path e.g. omar-ndiaye-illqmu/single-training-session
 *
 * If the Cal username or event slug changes, update data-cal-link (and namespace if Cal renames it).
 */
(function (C, A, L) {
  let p = function (a, ar) {
    a.q.push(ar);
  };
  let d = C.document;
  C.Cal =
    C.Cal ||
    function () {
      let cal = C.Cal;
      let ar = arguments;
      if (!cal.loaded) {
        cal.ns = {};
        cal.q = cal.q || [];
        d.head.appendChild(d.createElement("script")).src = A;
        cal.loaded = true;
      }
      if (ar[0] === L) {
        const api = function () {
          p(api, arguments);
        };
        const namespace = ar[1];
        api.q = api.q || [];
        if (typeof namespace === "string") {
          cal.ns[namespace] = cal.ns[namespace] || api;
          p(cal.ns[namespace], ar);
          p(cal, ["initNamespace", namespace]);
        } else p(cal, ar);
        return;
      }
      p(cal, ar);
    };
})(window, "https://app.cal.com/embed/embed.js", "init");

(function () {
  var ORIGIN = "https://app.cal.com";

  function initEmbeds() {
    var hosts = document.querySelectorAll(
      ".cal-embed-host[data-cal-namespace][data-cal-link]"
    );
    if (!hosts.length) return;

    hosts.forEach(function (el) {
      var namespace = el.getAttribute("data-cal-namespace");
      var calLink = el.getAttribute("data-cal-link");
      if (!namespace || !calLink) return;

      Cal("init", namespace, { origin: ORIGIN });
      Cal.ns[namespace]("inline", {
        elementOrSelector: el,
        calLink: calLink,
        config: {
          layout: "month_view",
          useSlotsViewOnSmallScreen: "true",
        },
      });
      Cal.ns[namespace]("ui", {
        hideEventTypeDetails: false,
        layout: "month_view",
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initEmbeds);
  } else {
    initEmbeds();
  }
})();
