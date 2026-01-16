(function () {
  const tablist = document.querySelector(".tablist");
  if (!tablist) return;

  const STORAGE_KEY = "activeTabId";

  const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
  const panels = Array.from(document.querySelectorAll('[role="tabpanel"]'));

  function activateTab(tab, opts = {}) {
    const { skipSave = false } = opts;
    const targetId = tab.getAttribute("aria-controls");

    tabs.forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
    panels.forEach((p) => (p.dataset.active = String(p.id === targetId)));

    if (!skipSave && window.localStorage) {
      localStorage.setItem(STORAGE_KEY, tab.id);
    }

    if (targetId === "panel-map" && typeof window.initMap === "function") {
      window.initMap("#map-root");
    }

    if (targetId === "panel-tuning" && typeof window.initTuningChart === "function") {
      window.initTuningChart("#tuningChart-wrap");
    }
  }

  tablist.addEventListener("click", (e) => {
    const btn = e.target.closest('[role="tab"]');
    if (!btn) return;
    activateTab(btn);
  });

  tablist.addEventListener("keydown", (e) => {
    const current = document.activeElement;
    if (!tabs.includes(current)) return;

    let idx = tabs.indexOf(current);

    if (e.key === "ArrowRight") {
      idx = (idx + 1) % tabs.length;
      tabs[idx].focus();
      e.preventDefault();
    }

    if (e.key === "ArrowLeft") {
      idx = (idx - 1 + tabs.length) % tabs.length;
      tabs[idx].focus();
      e.preventDefault();
    }

    if (e.key === "Enter" || e.key === " ") {
      activateTab(tabs[idx]);
      e.preventDefault();
    }
  });

  window.addEventListener("load", () => {
    if (window.localStorage) {
      const savedId = localStorage.getItem(STORAGE_KEY);
      const savedTab = tabs.find((t) => t.id === savedId);
      if (savedTab) {
        activateTab(savedTab, { skipSave: true });
        return;
      }
    }

    const defaultTab = tabs[0];
    if (defaultTab) activateTab(defaultTab, { skipSave: true });
  });
})();

document.addEventListener("DOMContentLoaded", () => {
  const h4s = document.querySelectorAll("#panel-info h4, #panel-map .panel-content > h4");

  h4s.forEach((h4) => {
    h4.classList.add("accordion-header");

    const panel = document.createElement("div");
    panel.className = "accordion-panel";

    let sib = h4.nextSibling;
    while (sib && !(sib.nodeType === 1 && sib.tagName === "H4")) {
      const next = sib.nextSibling;
      panel.appendChild(sib);
      sib = next;
    }

    h4.parentNode.insertBefore(panel, h4.nextSibling);

    h4.addEventListener("click", () => {
      panel.classList.toggle("is-open");
    });
  });

  const blockHeaders = document.querySelectorAll(".accordion-block .accordion-header");

  blockHeaders.forEach((header) => {
    header.addEventListener("click", () => {
      const panel = header.nextElementSibling;
      if (!panel || !panel.classList.contains("accordion-panel")) return;
      panel.classList.toggle("is-open");
    });
  });
});
