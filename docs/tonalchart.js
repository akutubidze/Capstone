// tonalchart.js — tonal chart with safe highlight + working play/pause
(function(){
  let mounted = false;

  // Start / resume Tone on first user interaction
  window.addEventListener(
    "pointerdown",
    () => {
      if (Tone.getContext().state !== "running") Tone.start();
    },
    { once: true }
  );

  window.initTonalChart = function(mountSel){
    if (mounted) return;
    mounted = true;

    const host = document.querySelector(mountSel);
    if (!host) {
      console.error("Tonal chart mount not found:", mountSel);
      return;
    }

    // colors
    const OUTER_COLOR  = "#66c2a5";
    const INNER_COLOR  = "#8da0cb";
    const LABEL_COLOR  = "#5b5656ff";
    const GUIDE_STROKE = "#71807a";

    // data
    const degreeCents = [6, 205, 349, 495, 703, 868, 1018, 1182];
    const baseHz      = 261.63;
    const tetSemis    = [0, 2, 4, 5, 7, 9, 11, 12];
    const tetNotes    = ["C","D","E","F","G","A","B","C"];

    const outerData = tetSemis.map((semi, i) => ({
      i,
      note: tetNotes[i],
      cents: semi * 100,
      hz: baseHz * Math.pow(2, semi / 12)
    }));
    const innerData = degreeCents.map((cent, i) => ({
      i,
      cents: cent,
      hz: baseHz * Math.pow(2, cent / 1200)
    }));

    const width = 1000, height = 500;
    const cx = width / 2, cy = height - 120;

    // chart geometry
    const OUTER_R     = 300, OUTER_BAND = 55;
    const INNER_R     = 160, INNER_BAND = 55;
    const OUTER_NOTE_OFFSET = 30;

    // SVG & viewBox
    const svg = d3.select(host)
      .append("svg")
      .attr("class", "tonal-svg")
      .attr("preserveAspectRatio", "xMidYMid meet")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("width", 1050)
      .attr("height", 450)
      .style("display", "block")
      .style("margin", "0 auto");

    // main chart group (position + scale)
    const gChart = svg.append("g")
      .attr("class", "chart-root")
      .attr("transform", "translate(-110, 50) scale(1.17)");

    // ---- groups ----
    const g      = gChart.append("g");
    const guides = g.append("g");
    const gOuter = g.append("g");
    const gInner = g.append("g");
    const gBtns  = g.append("g");

    // section layout (outer/inner arcs)
    const sections     = 8;
    const angleOffset  = Math.PI / 2;
    const startA       = -Math.PI + angleOffset;
    const endA         = 0 + angleOffset;
    const step         = (endA - startA) / sections;
    const outerSlices  = d3.range(sections).map(i => ({ a0: startA + i * step, a1: startA + (i + 1) * step, i }));
    const innerSlices  = outerSlices.map(s => ({ ...s }));
    const labelAngleOffset = -Math.PI / 2;
    const labelMidAngle    = d => (d.a0 + d.a1) / 2 + labelAngleOffset;

    // --- legend math helpers ---
    function polarToXY(angleDeg, radius){
      const a = (angleDeg * Math.PI) / 180;
      return { x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius };
    }

    const legendItems = [
      { label: "Note Letters", type:"text", aLabel:-53, rLabel: OUTER_R+180, rLineStart: OUTER_R+155, rLineEnd: OUTER_R+43, aLineStart:-55, aLineEnd:-56 },
      { label: "Interval Cents", type:"text", aLabel:-36, rLabel: OUTER_R+185, rLineStart: OUTER_R+140, rLineEnd: OUTER_R-10, aLineStart:-39, aLineEnd:-53 },
      { label: "12-Tone Equal Temperament System", type:"patch", color: OUTER_COLOR, aLabel:-132, rLabel: OUTER_R+225, aLine:200, rLineStart: OUTER_R, rLineEnd: OUTER_R+40 },
      { label: "Georgian Measured Tuning",       type:"patch", color: INNER_COLOR, aLabel:-135, rLabel: OUTER_R+197, aLine:0,   rLineStart: INNER_R + INNER_BAND/2, rLineEnd: OUTER_R - 90 }
    ];

    // radial guides
    for (let i = 0; i <= sections; i++) {
      const ang = startA + i * step - Math.PI / 2;
      guides.append("line")
        .attr("x1", cx + Math.cos(ang) * INNER_R)
        .attr("y1", cy + Math.sin(ang) * INNER_R)
        .attr("x2", cx + Math.cos(ang) * OUTER_R)
        .attr("y2", cy + Math.sin(ang) * OUTER_R)
        .attr("stroke", GUIDE_STROKE)
        .attr("stroke-opacity", 0.35)
        .attr("stroke-width", 1);
    }

    // arcs
    const arcOuter = d3.arc().innerRadius(OUTER_R - OUTER_BAND).outerRadius(OUTER_R).startAngle(d => d.a0).endAngle(d => d.a1);
    const arcInner = d3.arc().innerRadius(INNER_R).outerRadius(INNER_R + INNER_BAND).startAngle(d => d.a0).endAngle(d => d.a1);

    // ---- audio: sampler + helpers ----
    let sampler = null;
    let warmed = false;
    let isPlaying = false;
    let scheduledIds = [];

    async function setupAudio() {
      if (sampler) return;
      await Tone.start();
      const baseUrl = "piano_samples/";
      const urls = {
        "C4":"C4.mp3","Db4":"Db4.mp3","D4":"D4.mp3","Eb4":"Eb4.mp3","E4":"E4.mp3",
        "F4":"F4.mp3","Gb4":"Gb4.mp3","G4":"G4.mp3","Ab4":"Ab4.mp3","A4":"A4.mp3",
        "Bb4":"Bb4.mp3","B4":"B4.mp3","C5":"C5.mp3"
      };
      sampler = new Tone.Sampler({ urls, baseUrl, release: 0.2 }).toDestination();
      await Tone.loaded();
    }

    function playHz(hz, when = 0, dur = 1.0) {
      if (!sampler) return;
      const t = Tone.now() + when;
      sampler.triggerAttackRelease(hz, dur, t);
    }

    async function ensureWarmup() {
      await setupAudio();
      if (!sampler || warmed) return;
      warmed = true;

      const prevVol = sampler.volume.value;
      sampler.volume.value = -60;

      const base = Tone.now() + 0.03;
      ["C4","D4","E4","F4","G4","A4","B4","C5"].forEach((n, i) => {
        sampler.triggerAttackRelease(n, 0.05, base + i * 0.03);
      });

      await new Promise(res => setTimeout(res, 400));
      sampler.volume.value = prevVol;
    }

    function stopSequence() {
      if (!isPlaying) return;
      isPlaying = false;
      scheduledIds.forEach(id => Tone.Transport.clear(id));
      scheduledIds = [];
      sampler && sampler.releaseAll();
      // don’t hard-stop Transport (keeps timing smooth); just clear
    }

    async function playSequence(items) {
      await ensureWarmup();
      if (!sampler) return;

      // toggle
      if (isPlaying) { stopSequence(); return; }

      isPlaying = true;
      scheduledIds = [];

      const dur = 1.0;
      const spacing = 0.5;

      Tone.Transport.start();

      items.slice().sort((a,b)=>a.i-b.i).forEach((d, idx) => {
        const at = idx * spacing;
        const id = Tone.Transport.schedule(time => {
          if (!isPlaying) return;
          if (d.node) {
            Tone.Draw.schedule(() => highlightOn(d.node), time);
            Tone.Draw.schedule(() => highlightOff(d.node), time + 0.4);
          }
          sampler.triggerAttackRelease(d.hz, dur, time);
        }, `+${at}`);
        scheduledIds.push(id);
      });

      const total = spacing * items.length + dur;
      const stopId = Tone.Transport.schedule(() => {
        isPlaying = false;
        sampler.releaseAll();
      }, `+${total}`);
      scheduledIds.push(stopId);
    }

    // --- safe highlight ---
    function highlightOn(node){
      const el = d3.select(node);
      const origFill   = el.attr("fill");
      const origStroke = el.attr("stroke");
      const origSw     = el.attr("stroke-width") || 2;

      el.attr("_origFill",   origFill);
      el.attr("_origStroke", origStroke);
      el.attr("_origSW",     origSw);

      el.attr("fill", d3.color(origFill).brighter(0.8))
        .attr("stroke", d3.color(origFill).brighter(1.2))
        .attr("stroke-width", +origSw + 3)
        .attr("stroke-opacity", 1);
    }
    function highlightOff(node){
      const el = d3.select(node);
      const origFill   = el.attr("_origFill")   || el.attr("fill");
      const origStroke = el.attr("_origStroke") || el.attr("stroke");
      const origSw     = el.attr("_origSW")     || 2;

      el.attr("fill", origFill)
        .attr("stroke", origStroke)
        .attr("stroke-width", origSw)
        .attr("stroke-opacity", 1);
    }

    // mapped geometry + data
    const outerMapped = outerSlices.map((s, i) => ({ ...s, i, note: outerData[i].note, cents: outerData[i].cents, hz: outerData[i].hz }));
    const innerMapped = innerSlices.map((s, i) => ({ ...s, i, cents: innerData[i].cents, hz: innerData[i].hz }));

    // outer ring
    const outerSel = gOuter.selectAll(null).data(outerMapped).enter().append("path")
      .attr("class","outer").attr("transform", `translate(${cx},${cy})`).attr("d", arcOuter)
      .attr("fill", OUTER_COLOR).attr("fill-opacity", 0.55)
      .attr("stroke", OUTER_COLOR).attr("stroke-opacity", 0.85).attr("stroke-width", 2)
      .style("cursor","pointer")
      .on("mouseover", function(){ d3.select(this).attr("fill", d3.color(OUTER_COLOR).brighter(0.8)); })
      .on("mouseout",  function(){ d3.select(this).attr("fill", OUTER_COLOR); })
      .on("pointerdown", async function(_, d){ await ensureWarmup(); const t = Tone.now(); Tone.Draw.schedule(() => highlightOn(this), t); Tone.Draw.schedule(() => highlightOff(this), t + 0.5); playHz(d.hz, 0, 1.0); });
    outerSel.each(function(d){ d.node = this; });

    // inner ring
    const innerSel = gInner.selectAll(null).data(innerMapped).enter().append("path")
      .attr("class","inner").attr("transform", `translate(${cx},${cy})`).attr("d", arcInner)
      .attr("fill", INNER_COLOR).attr("fill-opacity", 0.55)
      .attr("stroke", INNER_COLOR).attr("stroke-opacity", 0.9).attr("stroke-width", 2)
      .style("cursor","pointer")
      .on("mouseover", function(){ d3.select(this).attr("fill", d3.color(INNER_COLOR).brighter(0.8)); })
      .on("mouseout",  function(){ d3.select(this).attr("fill", INNER_COLOR); })
      .on("pointerdown", async function(_, d){ await ensureWarmup(); const t = Tone.now(); Tone.Draw.schedule(() => highlightOn(this), t); Tone.Draw.schedule(() => highlightOff(this), t + 0.5); playHz(d.hz, 0, 1.0); });
    innerSel.each(function(d){ d.node = this; });

    // labels: cents
    gOuter.selectAll(null).data(outerMapped).enter().append("text")
      .attr("class","outer-label")
      .attr("x", d => cx + Math.cos(labelMidAngle(d)) * (OUTER_R - OUTER_BAND / 2))
      .attr("y", d => cy + Math.sin(labelMidAngle(d)) * (OUTER_R - OUTER_BAND / 2))
      .attr("text-anchor","middle").attr("font-size","18").attr("font-weight","600").attr("dy", "6")
      .attr("fill", LABEL_COLOR).style("cursor","pointer")
      .on("pointerdown", async (_, d) => { await ensureWarmup(); playHz(d.hz, 0, 1.0); })
      .text(d => Math.round(d.cents));

    gInner.selectAll(null).data(innerMapped).enter().append("text")
      .attr("class","inner-label")
      .attr("x", d => cx + Math.cos(labelMidAngle(d)) * (INNER_R + INNER_BAND / 2))
      .attr("y", d => cy + Math.sin(labelMidAngle(d)) * (INNER_R + INNER_BAND / 2))
      .attr("text-anchor","middle").attr("font-size","18").attr("font-weight","600").attr("dy", "6")
      .attr("fill", LABEL_COLOR).style("cursor","pointer")
      .on("pointerdown", async (_, d) => { await ensureWarmup(); playHz(d.hz, 0, 1.0); })
      .text(d => Math.round(d.cents));

    // note letters
    const gOuterNotes = g.append("g").attr("class","outer-note-letters");
    gOuterNotes.selectAll(null).data(outerMapped).enter().append("text")
      .attr("class","outer-note")
      .attr("x", d => cx + Math.cos(labelMidAngle(d)) * (OUTER_R + OUTER_NOTE_OFFSET))
      .attr("y", d => cy + Math.sin(labelMidAngle(d)) * (OUTER_R + OUTER_NOTE_OFFSET))
      .attr("text-anchor","middle").attr("font-size","20").attr("font-weight","700").attr("dy", "6")
      .attr("fill", LABEL_COLOR)
      .text(d => d.note);

    // --- legend lines + bubble text ---
    const gLegend = gChart.append("g").attr("class", "chart-legend-bubbles");
    gLegend.selectAll("line")
      .data(legendItems.filter(d => d.aLineStart != null && d.aLineEnd != null))
      .enter()
      .append("line")
      .attr("x1", d => polarToXY(d.aLineStart, d.rLineStart).x)
      .attr("y1", d => polarToXY(d.aLineStart, d.rLineStart).y)
      .attr("x2", d => polarToXY(d.aLineEnd,   d.rLineEnd).x)
      .attr("y2", d => polarToXY(d.aLineEnd,   d.rLineEnd).y)
      .attr("stroke", "#7c7878ff")
      .attr("stroke-width", 1);

    const gLegendItems = gLegend.selectAll("g.legend-item")
      .data(legendItems)
      .enter()
      .append("g")
      .attr("class", "legend-item")
      .attr("transform", d => {
        const p = polarToXY(d.aLabel, d.rLabel);
        return `translate(${p.x}, ${p.y})`;
      });

    gLegendItems.each(function(d){
      const gg = d3.select(this);
      if (d.type === "patch") {
        gg.append("rect")
          .attr("x", -35).attr("y", -14).attr("width", 43).attr("height", 28).attr("rx", 4)
          .attr("fill", d.color).attr("fill-opacity", 0.9).attr("stroke", d.color);
        gg.append("text")
          .attr("x", 0).attr("y", 0).attr("text-anchor", "start").attr("dx", 20).attr("dy", "0.3em")
          .attr("font-size", 18).attr("fill", LABEL_COLOR).text(d.label);
      } else {
        gg.append("text")
          .attr("text-anchor", "middle").attr("dy", "0.3em").attr("font-size", 18).attr("fill", LABEL_COLOR)
          .text(d.label);
      }
    });

    // --- play / pause arc buttons + labels ---
    const btnInnerR = 15, btnOuterR = 120;
    const gap = 0, span = 1.568, bottom = 0;
    const btnShiftX = 200, btnShiftY = -200;

    const btnOuterPath = d3.arc().innerRadius(btnInnerR).outerRadius(btnOuterR).startAngle(bottom - span).endAngle(bottom - gap);
    const btnInnerPath = d3.arc().innerRadius(btnInnerR).outerRadius(btnOuterR).startAngle(bottom + gap).endAngle(bottom + span);
    const btnTranslate = (xShift, yShift) => {
      const dx = Math.cos(bottom) * yShift + xShift;
      const dy = Math.sin(bottom) * yShift;
      return `translate(${cx + dx}, ${cy + dy})`;
    };

    // Western button (12TET)
    gBtns.append("path")
      .attr("transform", btnTranslate(btnShiftX, btnShiftY-10))
      .attr("d", btnOuterPath())
      .attr("fill", OUTER_COLOR).attr("fill-opacity", 0.4)
      .attr("stroke", '#87aca1ff').attr("stroke-width", 2).attr("stroke-opacity", 1)
      .style("filter", "drop-shadow(1px 3px 2px #0003)")
      .style("cursor", "pointer")
      .on("pointerdown", async () => { await ensureWarmup(); playSequence(outerMapped); })
      .on("mouseover", function(){ d3.select(this).attr("fill", d3.color(OUTER_COLOR).brighter(0.8)); })
      .on("mouseout",  function(){ d3.select(this).attr("fill", OUTER_COLOR).attr("fill-opacity", 0.4); });

    // Georgian button
    gBtns.append("path")
      .attr("transform", btnTranslate(btnShiftX, btnShiftY+10))
      .attr("d", btnInnerPath())
      .attr("fill", INNER_COLOR).attr("fill-opacity", 0.4)
      .attr("stroke", INNER_COLOR).attr("stroke-width", 2).attr("stroke-opacity", 1)
      .style("filter", "drop-shadow(1px 5px 2px #0003)")
      .style("cursor", "pointer")
      .on("pointerdown", async () => { await ensureWarmup(); playSequence(innerMapped); })
      .on("mouseover", function(){ d3.select(this).attr("fill", d3.color(INNER_COLOR).brighter(0.8)); })
      .on("mouseout",  function(){ d3.select(this).attr("fill", INNER_COLOR).attr("fill-opacity", 0.4); });

    // Label + play/pause controls for 12TET
    const lbl12 = gBtns.append("text")
      .attr("x", 450)
      .attr("y", 350)
      .attr("text-anchor", "middle")
      .attr("font-size", 17)
      .attr("font-weight", "600")
      .attr("fill", "#6a6464ff")
      .style("cursor", "pointer")
      .text("12TET")
      .on("pointerdown", async () => { await ensureWarmup(); playSequence(outerMapped); });

    gBtns.append("text")
      .attr("id", "btn12tetPlay")
      .attr("x", 395)
      .attr("y", 350)
      .attr("font-size", 14)
      .attr("font-weight", "700")
      .attr("fill", LABEL_COLOR)
      .style("cursor", "pointer")
      .text("▶")
      .on("pointerdown", async () => { await ensureWarmup(); playSequence(outerMapped); });

    gBtns.append("text")
      .attr("id", "btn12tetPause")
      .attr("x", 410)
      .attr("y", 351)
      .attr("font-size", 20)
      .attr("font-weight", "700")
      .attr("fill", LABEL_COLOR)
      .style("cursor", "pointer")
      .text("⏸")
      .on("pointerdown", () => { stopSequence(); });

    // Label + play/pause controls for Georgian
    const lblGeo = gBtns.append("text")
      .attr("x", 505)
      .attr("y", 365)
      .attr("text-anchor", "middle")
      .attr("font-size", 15)
      .attr("font-weight", "1000")
      .attr("fill", LABEL_COLOR)
      .html(`<tspan x="585">Georgian</tspan><tspan x="585" dy="1em">Measured</tspan><tspan x="585" dy="1em">Tuning</tspan>`)
      .attr("dy", "-2.0em")
      .style("cursor", "pointer")
      .on("pointerdown", async () => { await ensureWarmup(); playSequence(innerMapped); });

    gBtns.append("text")
      .attr("id", "btnGeoPlay")
      .attr("x", 518)
      .attr("y", 351)
      .attr("font-size", 14)
      .attr("font-weight", "800")
      .attr("fill", LABEL_COLOR)
      .style("cursor", "pointer")
      .text("▶")
      .on("pointerdown", async () => { await ensureWarmup(); playSequence(innerMapped); });

    gBtns.append("text")
      .attr("id", "btnGeoPause")
      .attr("x", 532)
      .attr("y", 353)
      .attr("font-size", 22)
      .attr("font-weight", "700")
      .attr("fill", LABEL_COLOR)
      .style("cursor", "pointer")
      .text("⏸")
      .on("pointerdown", () => { stopSequence(); });
  };
})();
