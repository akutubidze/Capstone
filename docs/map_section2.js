document.addEventListener("DOMContentLoaded", () => {
  // =======================
  // D3 MAP
  // =======================
  const width = 1200;
  const height = 780;

  const svg = d3.select("#map")
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .style("background-color", "#d0d9cd");

  const defs = svg.append("defs");

  // Softer shadows
  const raised = defs.append("filter")
    .attr("id", "neumorphic-raised")
    .attr("x", "-40%").attr("y", "-50%")
    .attr("width", "200%").attr("height", "200%");
  raised.append("feDropShadow").attr("dx", "5").attr("dy", "3").attr("stdDeviation", "2").attr("flood-color", "#bebebe");
  raised.append("feDropShadow").attr("dx", "-2").attr("dy", "-2").attr("stdDeviation", "2").attr("flood-color", "#ffffff");

  const pressed = defs.append("filter")
    .attr("id", "neumorphic-pressed")
    .attr("x", "-50%").attr("y", "-50%")
    .attr("width", "200%").attr("height", "200%");
  pressed.append("feDropShadow").attr("dx", "0.5").attr("dy", "0.5").attr("stdDeviation", "0.8").attr("flood-color", "#aaaaaa");
  pressed.append("feDropShadow").attr("dx", "-0.5").attr("dy", "-0.5").attr("stdDeviation", "0.8").attr("flood-color", "#ffffff");

  const glow = defs.append("filter")
    .attr("id", "glow")
    .attr("x", "-50%").attr("y", "-50%")
    .attr("width", "200%")
    .attr("height", "200%");
  glow.append("feGaussianBlur").attr("stdDeviation", "3").attr("result", "coloredBlur");
  const feMerge = glow.append("feMerge");
  feMerge.append("feMergeNode").attr("in", "coloredBlur");
  feMerge.append("feMergeNode").attr("in", "SourceGraphic");

  const audioPlayerContainer = document.getElementById("audio-player-container");
  const audioElement = document.getElementById("custom-audio");
  const nowPlaying = document.getElementById("now-playing");
  const tooltip = d3.select("#map-tooltip");

  let currentRegion = null;

  d3.json('./Geo_Data/REG_AUD.geojson').then(geoData => {
    const projection = d3.geoMercator().fitSize([width, height], geoData);
    const path = d3.geoPath().projection(projection);

    // --- custom region colors (with a few aliases) ---
    const regionColors = {
      // gray (same for both)
      "Abkhazia": "#b3b3b3",
      "South Ossetia": "#b3b3b3",
      "South-Ossetia": "#b3b3b3",

      // light green
      "Samegrelo": "#66c2a5", "Imereti": "#66c2a5", "Achara": "#66c2a5", "Guria": "#66c2a5",

      // light blue
      "Svaneti": "#8da0cb", "Racha": "#8da0cb", "Lechkhumi": "#8da0cb",

      // light brown
      "Shida Kartli": "#e5c494", "Kvemo Kartli": "#e5c494", "Kakheti": "#e5c494",

      // light beige
      "Javakheti": "#f6e3c5", "Tbilisi": "#f6e3c5",

      // light red
      "Khevi": "#e78ac3", "Khevsureti": "#e78ac3",
      "Tusheti": "#e78ac3", "Mtiuleti": "#e78ac3", "Pshavi": "#e78ac3",
      "Ertso Tianeti": "#e78ac3", "Ertso-Tianeti": "#e78ac3"
    };
    const safeColor = name => regionColors[name] || "#eee";

    // Build paths
    const regions = svg.selectAll("path")
      .data(geoData.features)
      .enter()
      .append("path")
      .attr("d", path)
      .attr("fill", d => safeColor(d.properties.name))
      .attr("stroke", "black")
      .attr("stroke-width", 1)
      .attr("filter", "url(#neumorphic-raised)")
      .attr("id", d => d.properties.name);

    // Index regions by name for quick access
    const regionIndex = new Map();
    regions.each(function(d){ regionIndex.set(d.properties.name, d3.select(this)); });

    // Hover/click handlers on regions
    regions
      .on("mouseover", function(event, d) {
        const base = safeColor(d.properties.name);
        d3.select(this)
          .attr("fill", d3.color(base).brighter(0.8))
          .attr("filter", "url(#glow)");
        tooltip.style("display", "block")
          .html(`
            <strong>${d.properties.name}</strong><br>
            Song: "${d.properties.title}"<br>
            Artist: ${d.properties.artist}
          `)
          .style("left", `${event.pageX + 10}px`)
          .style("top", `${event.pageY - 20}px`);
      })
      .on("mouseout", function(event, d) {
        if (currentRegion !== d.properties.name) {
          d3.select(this)
            .attr("fill", safeColor(d.properties.name))
            .attr("filter", "url(#neumorphic-raised)");
        } else {
          d3.select(this).attr("filter", "url(#neumorphic-pressed)");
        }
        tooltip.style("display", "none");
      })
      .on("click", function(event, d) {
        // reset others
        regions
          .attr("fill", dd => safeColor(dd.properties.name))
          .attr("filter", "url(#neumorphic-raised)");

        // press selected
        const el = d3.select(this).attr("filter", "url(#neumorphic-pressed)");
        const src = d.properties.audio;
        if (src) {
          audioElement.src = src;
          audioElement.play();
          audioPlayerContainer.style.display = "block";
          nowPlaying.textContent = `Now Playing: "${d.properties.title}" by ${d.properties.artist} (${d.properties.name})`;
          currentRegion = d.properties.name;
        }
      });

    // --- region name labels (bigger + color) ---
    svg.selectAll("text.region-label")
      .data(geoData.features)
      .enter()
      .append("text")
      .attr("class", "region-label")
      .filter(d => {
        const b = path.bounds(d);
        const area = (b[1][0] - b[0][0]) * (b[1][1] - b[0][1]);
        return area > 2000;
      })
      .attr("x", d => path.centroid(d)[0])
      .attr("y", d => path.centroid(d)[1])
      .text(d => d.properties.name)
      .attr("text-anchor", "middle")
      .attr("font-size", "16px")              // +30% from 10px
      .attr("fill", "#525050ff");

    // --- Macro groups + labels ---
    const macroGroups = {
      "Western Georgia": ["Abkhazia","Samegrelo","Guria","Achara","Imereti"],
      "Eastern Georgia": ["Javakheti","Shida Kartli","Kvemo Kartli","Kakheti","Tbilisi","South Ossetia","Ertso Tianeti","South-Ossetia","Ertso-Tianeti"],
      "Northeastern regions": ["Khevi","Khevsureti","Tusheti","Mtiuleti","Pshavi"],
      "Northwestern regions": ["Svaneti","Racha","Lechkhumi"]
    };

    // Easy-to-edit positions for macro labels (in SVG px)
    const macroLabelPos = {
      "Western Georgia":        { x: 160, y: height - 350 },
      "Eastern Georgia":        { x: width - 330, y: height - 40 },
      "Northeastern regions":   { x: width - 300, y: 240 },
      "Northwestern regions":   { x: 400, y: 100 }
    };

    // helpers to glow/un-glow groups
    function glowRegions(names) {
      names.forEach(n => {
        const sel = regionIndex.get(n);
        if (!sel) return;
        const base = safeColor(n);
        sel.attr("fill", d3.color(base).brighter(0.8))
           .attr("filter", "url(#glow)");
      });
    }
    function unglowRegions(names) {
      names.forEach(n => {
        const sel = regionIndex.get(n);
        if (!sel) return;
        // restore pressed if currently selected, else raised
        if (currentRegion === n) {
          sel.attr("fill", safeColor(n)).attr("filter", "url(#neumorphic-pressed)");
        } else {
          sel.attr("fill", safeColor(n)).attr("filter", "url(#neumorphic-raised)");
        }
      });
    }

    // Draw macro labels
    const macro = svg.selectAll("text.macro-label")
      .data(Object.keys(macroGroups))
      .enter()
      .append("text")
      .attr("class", "macro-label")
      .attr("x", d => macroLabelPos[d].x)
      .attr("y", d => macroLabelPos[d].y)
      .text(d => d)
      .attr("font-size", "20px")
      .attr("font-weight", 600)
      .attr("fill", "#525050ff")
      .attr("text-anchor", "middle")
      .style("cursor", "pointer")
      .on("mouseover", (event, label) => glowRegions(macroGroups[label]))
      .on("mouseout",  (event, label) => unglowRegions(macroGroups[label]))
      .on("click",    (event, label) => {
        // Click behaves like hover: glow while hovered; no audio
        glowRegions(macroGroups[label]);
        // small timeout to avoid sticky glow if user clicks and leaves
        setTimeout(() => unglowRegions(macroGroups[label]), 250);
      });

    // --- Region list just under the map (closer + tighter) ---
const regionGroupsList = [
  ["Abkhazia","Svaneti","Samegrelo","Guria","Achara"],
  ["Racha","Lechkhumi","Imereti","Javakheti","South Ossetia"],
  ["Shida Kartli","Kvemo Kartli","Kakheti","Tbilisi","Ertso Tianeti"],
  ["Khevi","Khevsureti","Tusheti","Mtiuleti","Pshavi"]
];

// Append list inside #map container (directly under SVG)
const listWrap = d3.select("#map")
  .append("div")
  .attr("id","region-list");

const colWraps = listWrap.selectAll(".region-col")
  .data(regionGroupsList)
  .enter()
  .append("div")
  .attr("class","region-col");

colWraps.each(function(col) {
  const colDiv = d3.select(this);
  col.forEach(rName => {
    colDiv.append("div")
      .attr("class","region-item")
      .text(rName)
      .on("mouseover", () => glowRegions([rName]))
      .on("mouseout",  () => unglowRegions([rName]))
      .on("click", () => {
        // reset visuals
        regions.attr("filter","url(#neumorphic-raised)")
               .attr("fill", d => safeColor(d.properties.name));

        // press selected + play audio
        const regEl = regionIndex.get(rName);
        const feature = geoData.features.find(f => f.properties.name === rName);
        if (regEl) regEl.attr("filter","url(#neumorphic-pressed)");
        if (feature && feature.properties.audio) {
          audioElement.src = feature.properties.audio;
          audioElement.play();
          audioPlayerContainer.style.display = "block";
          nowPlaying.textContent =
            `Now Playing: "${feature.properties.title}" by ${feature.properties.artist} (${feature.properties.name})`;
          currentRegion = feature.properties.name;
        }
      });
  });
});

  }).catch(error => console.error("Error loading GeoJSON:", error));

  // =======================
  // Scrollytelling (compact + reversible)
  // =======================
  const section1 = document.getElementById('section-1');
  const pin = section1.querySelector('.pin-wrap');
  const spacer = document.getElementById('scrolly-spacer');
  const handoffSpacer = document.getElementById('handoff-spacer');
  const para1 = document.getElementById('para1');
  const para2 = document.getElementById('para2');
  const bannerEl = pin.querySelector('.banner-image');
  const mapEl = document.getElementById('map');

  const STORY_VH = 1.8;
  const HANDOFF_VH = 1.2;
  const REVEAL_START_P = 0.65;
  const APPEAR_PORTION = 0.85;
  const BANNER_HIDE_PCT = 70;

  function sizeSpacers() {
    spacer.style.height = `${Math.max(1, Math.round(window.innerHeight * STORY_VH))}px`;
    handoffSpacer.style.height = `${Math.max(1, Math.round(window.innerHeight * HANDOFF_VH))}px`;
  }
  sizeSpacers();
  window.addEventListener('resize', sizeSpacers);

  const clamp = (v, a=0, b=1) => Math.max(a, Math.min(b, v));
  const seg   = (x,a,b) => clamp((x - a) / (b - a));
  const ease  = x => x * (2 - x);

  let bannerHidden = false;

  function updateScrolly() {
    const r = section1.getBoundingClientRect();
    const vh = window.innerHeight;
    const pinH = pin.offsetHeight || vh;

    const storyLen = pinH + Math.max(1, spacer.offsetHeight || 0);
    const handLen  = Math.max(1, handoffSpacer.offsetHeight || 0);

    const y = vh - r.top;
    const p = clamp(y / storyLen);
    const q = clamp((y - storyLen) / handLen);

    const o1 =
      (p <= 0.15) ? ease(seg(p, 0.00, 0.15)) :
      (p <= 0.30) ? 1 :
      (p <= 0.55) ? 1 - ease(seg(p, 0.30, 0.55)) :
      0;

    const o2 =
      (p <= 0.55) ? 0 :
      (p <= 0.70) ? ease(seg(p, 0.55, 0.70)) :
      (p <= 0.82) ? 1 :
      1 - ease(seg(p, 0.82, 1.00));

    para1.style.opacity = o1;
    para2.style.opacity = o2;

    const early = clamp((p - REVEAL_START_P) / (1 - REVEAL_START_P));
    const hand  = clamp(q / APPEAR_PORTION);
    const c     = ease(Math.max(early, hand));
    section1.querySelectorAll(
      '.section-content-1 > h2, .section-content-1 > p.left-align:not(.scroll-para), .section-content-1 > ul.list-1'
    ).forEach(el => {
      el.style.opacity = c;
      el.style.transform = `translateY(${(1 - c) * 16}px)`;
    });

    if (q < 1) {
      pin.classList.remove('banner-fixed');
      bannerEl.style.transform = `translateY(${-BANNER_HIDE_PCT * ease(q)}%)`;
      bannerHidden = false;
    } else {
      pin.classList.add('banner-fixed');
      bannerEl.style.transform = `translateY(${-BANNER_HIDE_PCT}%)`;
    }
  }

  new IntersectionObserver(([e]) => {
    if (!e?.isIntersecting) return;
    if (!pin.classList.contains('banner-fixed') || bannerHidden) return;
    bannerEl.style.transform = 'translateY(-100%)';
    bannerHidden = true;
    bannerEl.addEventListener('transitionend', () => {
      pin.classList.remove('banner-fixed');
    }, { once: true });
  }, { threshold: 0.12, rootMargin: '0px 0px -40% 0px' }).observe(mapEl);

  let ticking = false;
  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(() => {
        updateScrolly();
        ticking = false;
      });
      ticking = true;
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  updateScrolly();

  // =======================
  // Close (×) button for audio player
  // =======================
  const closeBtn = document.getElementById("close-player");
  if (closeBtn && audioPlayerContainer && audioElement) {
    closeBtn.addEventListener("click", () => {
      audioElement.pause();
      audioElement.currentTime = 0;
      audioPlayerContainer.style.display = "none";
    });
  }
});