import { NextResponse } from "next/server";

/**
 * The portfolio widget: `<script src="https://burnlog.net/widget.js"
 * data-user="sharziki"></script>` renders a self-contained burn card wherever
 * it's dropped.
 *
 * Constraints that shape this file: no dependencies, no globals leaked, no
 * layout thrash on the host page, and it must work when several widgets sit
 * on the same page. Everything lives in one IIFE and all styles are inline,
 * so it can never fight the host's CSS.
 */

const SCRIPT = String.raw`(function () {
  "use strict";

  var current = document.currentScript;
  if (!current) return;

  var user = current.getAttribute("data-user");
  if (!user) return;

  var theme = current.getAttribute("data-theme") === "light" ? "light" : "dark";
  var origin = new URL(current.src, location.href).origin;

  var C = theme === "light"
    ? { bg: "#FFFFFF", border: "#E4E4E7", text: "#18181B", muted: "#71717A", faint: "#D4D4D8" }
    : { bg: "#0C0C0E", border: "#18181B", text: "#FAFAFA", muted: "#71717A", faint: "#27272A" };
  var AMBER = "#D97706";
  var MONO = 'ui-monospace,SFMono-Regular,Menlo,monospace';

  // Reserve the slot immediately so the host page doesn't reflow on load.
  var root = document.createElement("a");
  root.href = origin + "/u/" + encodeURIComponent(user);
  root.target = "_blank";
  root.rel = "noopener";
  root.style.cssText = [
    "display:block", "box-sizing:border-box", "width:100%", "max-width:340px",
    "min-height:132px", "padding:16px 18px", "border-radius:12px",
    "border:1px solid " + C.border, "background:" + C.bg,
    "text-decoration:none", "font-family:" + MONO, "line-height:1.4"
  ].join(";");
  current.parentNode.insertBefore(root, current.nextSibling);

  function el(tag, css, text) {
    var n = document.createElement(tag);
    n.style.cssText = css;
    if (text != null) n.textContent = text;
    return n;
  }

  function fmt(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return String(n);
  }

  function render(d) {
    root.textContent = "";

    var head = el("div", "display:flex;align-items:center;gap:8px");
    var mark = document.createElement("span");
    mark.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
      '<path fill="' + AMBER + '" d="M12 1.4c1.2 3.6 3 5.2 4.7 7 1.7 1.8 2.9 3.6 2.9 6.3 0 4.6-3.5 8.3-7.6 8.3S4.4 19.3 4.4 14.7c0-2.7 1.2-4.5 2.9-6.3C9 6.6 10.8 5 12 1.4z"/>' +
      '<path fill="' + C.bg + '" d="M12 9.6 17.6 16.9c.38.5.02 1.22-.6 1.22h-2.23c-.24 0-.47-.12-.61-.31L12 14.65l-2.16 3.15c-.14.19-.37.31-.61.31H7c-.62 0-.98-.72-.6-1.22L12 9.6z"/></svg>';
    mark.style.cssText = "display:flex;line-height:0";
    head.appendChild(mark);
    head.appendChild(el("span", "font-size:12px;font-weight:700;color:" + C.text, "@" + d.username));
    head.appendChild(el("span",
      "margin-left:auto;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:" + AMBER,
      d.rankIcon + " " + d.rank));
    root.appendChild(head);

    var total = el("div",
      "margin-top:12px;font-size:30px;font-weight:700;color:" + C.text + ";letter-spacing:-1px",
      fmt(d.totalTokens));
    root.appendChild(total);
    root.appendChild(el("div",
      "font-size:10px;letter-spacing:1.4px;text-transform:uppercase;color:" + C.muted,
      "tokens burned"));

    var spark = el("div", "display:flex;align-items:flex-end;gap:3px;height:26px;margin-top:12px");
    var series = d.weeklyHistory || [];
    var peak = Math.max.apply(null, series.concat([1]));
    for (var i = 0; i < series.length; i++) {
      var h = Math.max(2, Math.round((series[i] / peak) * 26));
      spark.appendChild(el("div",
        "flex:1;height:" + h + "px;border-radius:2px;background:" + AMBER +
        ";opacity:" + (i === series.length - 1 ? "1" : "0.4")));
    }
    root.appendChild(spark);

    var foot = el("div", "display:flex;margin-top:10px;font-size:10px;color:" + C.muted);
    foot.appendChild(el("span", "", d.streak + "d streak"));
    foot.appendChild(el("span", "margin-left:auto;color:" + C.faint, "burnlog"));
    root.appendChild(foot);
  }

  fetch(origin + "/api/widget/" + encodeURIComponent(user), { credentials: "omit" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (d && d.ok) render(d);
      else root.appendChild(el("div", "font-size:12px;color:" + C.muted, "burnlog · no such user"));
    })
    .catch(function () {
      root.appendChild(el("div", "font-size:12px;color:" + C.muted, "burnlog · unavailable"));
    });
})();`;

export const runtime = "nodejs";

export async function GET() {
  return new NextResponse(SCRIPT, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
