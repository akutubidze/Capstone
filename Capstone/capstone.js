document.addEventListener("DOMContentLoaded", () => {
  // =======================
  // D3 MAP (unchanged)
  // =======================
  const width = 1200;
  const height = 600;

  const svg = d3.select("#map")
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .style("background-color", "#d0d9cd");

  const defs = svg.append("defs");

  const raised = defs.append("filter")
    .attr("id", "neumorphic-raised")
    .attr("x", "-40%").attr("y", "-50%")
    .attr("width", "200%").attr("height", "200%");
  raised.append("feDropShadow").attr("dx", "9").attr("dy", "6").attr("stdDeviation", "4").attr("flood-color", "#bebebe");
  raised.append("feDropShadow").attr("dx", "-4").attr("dy", "-4").attr("stdDeviation", "4").attr("flood-color", "#ffffff");

  const pressed = defs.append("filter")
    .attr("id", "neumorphic-pressed")
    .attr("x", "-50%").attr("y", "-50%")
    .attr("width", "200%").attr("height", "200%");
  pressed.append("feDropShadow").attr("dx", "1").attr("dy", "1").attr("stdDeviation", "1").attr("flood-color", "#aaaaaa");
  pressed.append("feDropShadow").attr("dx", "-1").attr("dy", "-1").attr("stdDeviation", "1").attr("flood-color", "#ffffff");

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

  d3.json('../Geo_Data/REG_AUD_UPD.geojson').then(geoData => {
    const projection = d3.geoMercator().fitSize([width, height], geoData);
    const path = d3.geoPath().projection(projection);

    const colorScale = d3.scaleOrdinal()
      .domain(geoData.features.map(d => d.properties.name))
      .range(d3.schemePastel1);

    const regions = svg.selectAll("path")
      .data(geoData.features)
      .enter()
      .append("path")
      .attr("d", path)
      .attr("fill", d => colorScale(d.properties.name))
      .attr("stroke", "black")
      .attr("stroke-width", 1)
      .attr("filter", "url(#neumorphic-raised)")
      .attr("id", d => d.properties.name)
      .on("mouseover", function(event, d) {
        const baseColor = d3.color(colorScale(d.properties.name));
        const highlightColor = baseColor.brighter(0.8);
        d3.select(this)
          .attr("fill", highlightColor)
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
            .attr("fill", colorScale(d.properties.name))
            .attr("filter", "url(#neumorphic-raised)");
        }
        tooltip.style("display", "none");
      })
      .on("click", function(event, d) {
        const el = d3.select(this);
        regions.attr("fill", d => colorScale(d.properties.name))
               .attr("filter", "url(#neumorphic-raised)");
        if (currentRegion === d.properties.name && !audioElement.paused) {
          audioElement.pause();
        } else {
          el.attr("filter", "url(#neumorphic-pressed)");
          const src = d.properties.audio;
          if (src) {
            audioElement.src = src;
            audioElement.play();
            audioPlayerContainer.style.display = "block";
            nowPlaying.textContent = `Now Playing: "${d.properties.title}" by ${d.properties.artist} (${d.properties.name})`;
            currentRegion = d.properties.name;
          }
        }
      });

    svg.selectAll("text")
      .data(geoData.features)
      .enter()
      .append("text")
      .filter(d => {
        const bounds = path.bounds(d);
        const area = (bounds[1][0] - bounds[0][0]) * (bounds[1][1] - bounds[0][1]);
        return area > 2000;
      })
      .attr("x", d => path.centroid(d)[0])
      .attr("y", d => path.centroid(d)[1])
      .text(d => d.properties.name)
      .attr("text-anchor", "middle")
      .attr("font-size", "10px")
      .attr("fill", "black");

    const list = d3.select("#region-list");
    if (list.node()) {
      geoData.features.forEach(feature => {
        const div = list.append("div").attr("class", "region-item");
        div.html(`
          <strong>${feature.properties.name}</strong>:
          "${feature.properties.title}" by ${feature.properties.artist}
          <button style="margin-left: 8px;">Play</button>
        `);
        div.select("button").on("click", () => {
          regions
            .attr("filter", "url(#neumorphic-raised)")
            .filter(d => d.properties.name === feature.properties.name)
            .attr("filter", "url(#neumorphic-pressed)");
          if (feature.properties.audio) {
            audioElement.src = feature.properties.audio;
            audioElement.play();
            audioPlayerContainer.style.display = "block";
            nowPlaying.textContent = `Now Playing: "${feature.properties.title}" by ${feature.properties.artist} (${feature.properties.name})`;
            currentRegion = feature.properties.name;
          }
        });
      });
    }
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

  // Tunables (keep these sane)
  const STORY_VH        = 1.8;  // para1/para2 phase length (in viewport heights)
  const HANDOFF_VH      = 1.2;  // banner+content handoff length
  const REVEAL_START_P  = 0.65; // start revealing content near end of story
  const APPEAR_PORTION  = 0.85; // fraction of handoff used for reveal (0..1)
  const BANNER_HIDE_PCT = 70;   // banner lifts to this percent, then freezes

  function sizeSpacers() {
    spacer.style.height = `${Math.max(1, Math.round(window.innerHeight * STORY_VH))}px`;
    handoffSpacer.style.height = `${Math.max(1, Math.round(window.innerHeight * HANDOFF_VH))}px`;
  }
  sizeSpacers();
  window.addEventListener('resize', sizeSpacers);

  const clamp = (v, a=0, b=1) => Math.max(a, Math.min(b, v));
  const seg   = (x,a,b) => clamp((x - a) / (b - a));
  const ease  = x => x * (2 - x); // easeOut

  let bannerHidden = false; // only for the "slide fully off" step

  function updateScrolly() {
    const r = section1.getBoundingClientRect();
    const vh = window.innerHeight;
    const pinH = pin.offsetHeight || vh;

    const storyLen = pinH + Math.max(1, spacer.offsetHeight || 0);
    const handLen  = Math.max(1, handoffSpacer.offsetHeight || 0);

    const y = vh - r.top;
    const p = clamp(y / storyLen);              // story progress (0..1)
    const q = clamp((y - storyLen) / handLen);  // handoff progress (0..1)

    // Paragraph cross-fades (depend only on p → auto-reversible)
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

    // Content reveal (H2 + paras + lists)
    const early = clamp((p - REVEAL_START_P) / (1 - REVEAL_START_P));
    const hand  = clamp(q / APPEAR_PORTION);
    const c     = ease(Math.max(early, hand));
    section1.querySelectorAll(
      '.section-content-1 > h2, .section-content-1 > p.left-align:not(.scroll-para), .section-content-1 > ul.list-1'
    ).forEach(el => {
      el.style.opacity = c;
      el.style.transform = `translateY(${(1 - c) * 16}px)`;
    });

    // Banner: slide proportionally during handoff, freeze after
    if (q < 1) {
      pin.classList.remove('banner-fixed');
      bannerEl.style.transform = `translateY(${-BANNER_HIDE_PCT * ease(q)}%)`;
      bannerHidden = false;
    } else {
      pin.classList.add('banner-fixed');
      bannerEl.style.transform = `translateY(${-BANNER_HIDE_PCT}%)`;
    }
  }

  // Slide banner fully off when map is visible (then release overlay)
  new IntersectionObserver(([e]) => {
    if (!e?.isIntersecting) return;
    if (!pin.classList.contains('banner-fixed') || bannerHidden) return;

    bannerEl.style.transform = 'translateY(-100%)';
    bannerHidden = true;
    bannerEl.addEventListener('transitionend', () => {
      pin.classList.remove('banner-fixed');
    }, { once: true });
  }, { threshold: 0.12, rootMargin: '0px 0px -40% 0px' }).observe(mapEl);

  // Scroll loop
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