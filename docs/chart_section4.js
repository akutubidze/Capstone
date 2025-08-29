/* section4.js — Tonal chart with cents inside slices and note letters outside the outer rim (low-latency audio, self-hosted samples) */

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import * as Tone from "https://cdn.jsdelivr.net/npm/tone@14.7.77/+esm";

/* ===========================
   LOW-LATENCY AUDIO CONTEXT
=========================== */
Tone.setContext(new Tone.Context({ latencyHint: "interactive" }));
Tone.getContext().lookAhead = 0; // try 0–0.01 if you hear glitches
// Ensure AudioContext starts on first user gesture (silences the warning)
window.addEventListener("pointerdown", () => { Tone.start(); }, { once: true });

/* ===========================
   COLORS / CONFIG
=========================== */
const OUTER_COLOR = "#66c2a5";   // 12-TET rim + button
const INNER_COLOR = "#8da0cb";   // Georgian rim + button
const LABEL_COLOR = "#525050ff";
const GUIDE_STROKE = "#71807a";

/* Georgian degrees in cents (2016 GVM Harmonic) — 1..8 */
const degreeCents = [6, 205, 349, 495, 703, 868, 1018, 1182];

/* Base tonic (C4) */
const baseHz = 261.63;

/* 12-TET C→C (notes + cents) */
const tetSemis = [0, 2, 4, 5, 7, 9, 11, 12];
const tetNotes = ["C","D","E","F","G","A","B","C"];
const outerData = tetSemis.map((semi, i) => ({
  i,
  note: tetNotes[i],
  cents: semi * 100,
  hz: baseHz * Math.pow(2, semi/12)
}));
const innerData = degreeCents.map((cent, i) => ({
  i,
  cents: cent,
  hz: baseHz * Math.pow(2, cent/1200)
}));

/* ===========================
   SIZING / LAYOUT
=========================== */
const tonalChart = d3.select("#tonalChart-wrap");
const width = 1000, height = 700;
const cx = width/2, cy = height / 2;

// Rim geometry (transparent gap between rims)
const OUTER_R = 300, OUTER_BAND = 55;
const INNER_R = 160, INNER_BAND = 55;

const svg = tonalChart.append("svg")
  .attr("viewBox", `0 0 ${width} ${height}`)
  .attr("preserveAspectRatio", "xMidYMid meet");

/* Glow filter */
const defs = svg.append("defs");
const glow = defs.append("filter")
  .attr("id", "glow")
  .attr("x", "-50%").attr("y", "-50%")
  .attr("width", "200%").attr("height", "200%");
glow.append("feGaussianBlur").attr("stdDeviation", "3").attr("result", "coloredBlur");
const feMerge = glow.append("feMerge");
feMerge.append("feMergeNode").attr("in", "coloredBlur");
feMerge.append("feMergeNode").attr("in", "SourceGraphic");

/* Groups */
const g = svg.append("g");
const guides = g.append("g");
const gOuter = g.append("g");
const gInner = g.append("g");
const gBtns  = g.append("g");

/* ===========================
   ANGLES — SEMICIRCLE (rotated 90° clockwise)
=========================== */
const sections = 8;
const angleOffset = Math.PI / 2;
const startA = -Math.PI + angleOffset; // right
const endA = 0 + angleOffset;          // bottom
const step = (endA - startA) / sections;

const outerSlices = d3.range(sections).map(i => ({
  a0: startA + i*step,
  a1: startA + (i+1)*step,
  i
}));
const innerSlices = outerSlices.map(s => ({ ...s }));

// For label positions we keep the original "top semicircle" alignment
const labelAngleOffset = -Math.PI / 2;
const labelMidAngle = d => (d.a0 + d.a1) / 2 + labelAngleOffset;

/* ===========================
   GUIDES
=========================== */
for (let i = 0; i <= sections; i++) {
  const ang = startA + i*step - Math.PI / 2;
  guides.append("line")
    .attr("x1", cx + Math.cos(ang) * INNER_R)
    .attr("y1", cy + Math.sin(ang) * INNER_R)
    .attr("x2", cx + Math.cos(ang) * OUTER_R)
    .attr("y2", cy + Math.sin(ang) * OUTER_R)
    .attr("stroke", GUIDE_STROKE)
    .attr("stroke-opacity", 0.35)
    .attr("stroke-width", 1);
}

/* ===========================
   ARC GENERATORS
=========================== */
const arcOuter = d3.arc()
  .innerRadius(OUTER_R - OUTER_BAND)
  .outerRadius(OUTER_R)
  .startAngle(d => d.a0)
  .endAngle(d => d.a1);

const arcInner = d3.arc()
  .innerRadius(INNER_R)
  .outerRadius(INNER_R + INNER_BAND)
  .startAngle(d => d.a0)
  .endAngle(d => d.a1);

/* ===========================
   AUDIO — self-hosted samples + warmup
=========================== */
let sampler = null;
let warmed = false;

async function setupAudio() {
  if (sampler) return;
  if (Tone.getContext().state !== "running") return; // bail until the gesture starts audio

  await Tone.start();

  // If your folder sits next to this JS file:
  const baseUrl = new URL('./piano_samples/', import.meta.url).toString();
  // Or use site-root absolute: const baseUrl = '/piano_samples/';

  // Flats (Db/Eb/Gb/Ab/Bb) as per your filenames
  const urls = {
    'C4':  'C4.mp3',
    'Db4': 'Db4.mp3',
    'D4':  'D4.mp3',
    'Eb4': 'Eb4.mp3',
    'E4':  'E4.mp3',
    'F4':  'F4.mp3',
    'Gb4': 'Gb4.mp3',
    'G4':  'G4.mp3',
    'Ab4': 'Ab4.mp3',
    'A4':  'A4.mp3',
    'Bb4': 'Bb4.mp3',
    'B4':  'B4.mp3',
    'C5':  'C5.mp3'
  };

  sampler = new Tone.Sampler({
    urls,
    baseUrl,
    release: 0.2, // short tail for snappier feel
    onload: () => console.log('Sampler loaded from', baseUrl)
  }).toDestination();

  await Tone.loaded();
}

function playHz(hz, when = 0, dur = 1.0) {
  if (!sampler) return;
  const t = Tone.now() + when;                  // schedule on audio clock
  sampler.triggerAttackRelease(hz, dur, t);
}

/* Warm up once to decode/prime buffers and kill first-note lag */
async function ensureWarmup() {
  await setupAudio();
  if (warmed) return;
  warmed = true;
  const prev = sampler.volume.value;
  sampler.volume.value = -60;                   // silent warmup
  const base = Tone.now() + 0.03;
  ["C4","E4","G4","C5"].forEach((n, i) => {
    sampler.triggerAttackRelease(n, 0.04, base + i * 0.03);
  });
  Tone.Draw.schedule(() => { sampler.volume.value = prev; }, base + 0.18);
}

/* ===========================
   DATA MAPPING FOR SLICES
=========================== */
const outerMapped = outerSlices.map((s, i) => ({
  ...s,
  i,
  note: outerData[i].note,     // C D E F G A B C
  cents: outerData[i].cents,   // 0,200,400,500,700,900,1100,1200
  hz: outerData[i].hz
}));

const innerMapped = innerSlices.map((s, i) => ({
  ...s,
  i,
  cents: innerData[i].cents,   // 6,205,349,...
  hz: innerData[i].hz
}));

/* ===========================
   OUTER RIM (12-TET)
=========================== */
const outerSel = gOuter.selectAll(null)
  .data(outerMapped)
  .enter()
  .append("path")
  .attr("class","outer")
  .attr("transform", `translate(${cx},${cy})`)
  .attr("d", arcOuter)
  .attr("fill", OUTER_COLOR)
  .attr("fill-opacity", 0.55)
  .attr("stroke", OUTER_COLOR)
  .attr("stroke-opacity", 0.85)
  .attr("stroke-width", 2)
  .style("cursor","pointer")
  .on("mouseover", function() {
    d3.select(this)
      .attr("fill", d3.color(OUTER_COLOR).brighter(0.8))
      .attr("filter", "url(#glow)");
  })
  .on("mouseout", function() {
    d3.select(this)
      .attr("fill", OUTER_COLOR)
      .attr("filter", null);
  })
  .on("pointerdown", async function(_, d) {
    await ensureWarmup();
    const t = Tone.now();
    Tone.Draw.schedule(() => highlightOn(this), t);
    Tone.Draw.schedule(() => highlightOff(this), t + 0.5);
    playHz(d.hz, 0, 1.0);
  });

outerSel.each(function(d){ d.node = this; });

/* ===========================
   INNER RIM (Georgian)
=========================== */
const innerSel = gInner.selectAll(null)
  .data(innerMapped)
  .enter()
  .append("path")
  .attr("class","inner")
  .attr("transform", `translate(${cx},${cy})`)
  .attr("d", arcInner)
  .attr("fill", INNER_COLOR)
  .attr("fill-opacity", 0.55)
  .attr("stroke", INNER_COLOR)
  .attr("stroke-opacity", 0.9)
  .attr("stroke-width", 2)
  .style("cursor","pointer")
  .on("mouseover", function() {
    d3.select(this)
      .attr("fill", d3.color(INNER_COLOR).brighter(0.8))
      .attr("filter", "url(#glow)");
  })
  .on("mouseout", function() {
    d3.select(this)
      .attr("fill", INNER_COLOR)
      .attr("filter", null);
  })
  .on("pointerdown", async function(_, d) {
    await ensureWarmup();
    const t = Tone.now();
    Tone.Draw.schedule(() => highlightOn(this), t);
    Tone.Draw.schedule(() => highlightOff(this), t + 0.5);
    playHz(d.hz, 0, 1.0);
  });

innerSel.each(function(d){ d.node = this; });

/* ===========================
   LABELS — show CENTS inside both rims
=========================== */
// Outer rim: show 12-TET cents inside slices (instead of note letters)
gOuter.selectAll(".outer-label").remove();
gOuter.selectAll(null)
  .data(outerMapped)
  .enter()
  .append("text")
  .attr("class","outer-label")
  .attr("x", d => cx + Math.cos(labelMidAngle(d)) * (OUTER_R - OUTER_BAND/2))
  .attr("y", d => cy + Math.sin(labelMidAngle(d)) * (OUTER_R - OUTER_BAND/2))
  .attr("text-anchor","middle")
  .attr("font-size","18")
  .attr("font-weight","600")
  .attr("dy", "6")
  .attr("fill", LABEL_COLOR)
  .text(d => Math.round(d.cents));

// Inner rim: show Georgian cents inside slices (instead of 1..8)
gInner.selectAll(".inner-label").remove();
gInner.selectAll(null)
  .data(innerMapped)
  .enter()
  .append("text")
  .attr("class","inner-label")
  .attr("x", d => cx + Math.cos(labelMidAngle(d)) * (INNER_R + INNER_BAND/2))
  .attr("y", d => cy + Math.sin(labelMidAngle(d)) * (INNER_R + INNER_BAND/2))
  .attr("text-anchor","middle")
  .attr("font-size","18")
  .attr("font-weight","600")
  .attr("dy", "6")
  .attr("fill", LABEL_COLOR)
  .text(d => Math.round(d.cents));

/* ===========================
   NOTE LETTERS — OUTSIDE the outer rim, aligned to slices
=========================== */
const OUTER_NOTE_OFFSET = 28; // distance outside the rim
const gOuterNotes = g.append("g").attr("class","outer-note-letters");

gOuterNotes.selectAll(null)
  .data(outerMapped)
  .enter()
  .append("text")
  .attr("class","outer-note")
  .attr("x", d => cx + Math.cos(labelMidAngle(d)) * (OUTER_R + OUTER_NOTE_OFFSET))
  .attr("y", d => cy + Math.sin(labelMidAngle(d)) * (OUTER_R + OUTER_NOTE_OFFSET))
  .attr("text-anchor","middle")
  .attr("font-size","20")
  .attr("font-weight","700")
  .attr("dy", "6")
  .attr("fill", LABEL_COLOR)
  .text(d => d.note);

/* ===========================
   ARC-SHAPED PLAY BUTTONS
=========================== */
const btnInnerR = 10;    // must be smaller
const btnOuterR = 140;   // than this one (outer > inner)
const gap = 0;
const span = 1.575;
const bottom = 0;        // 9 o'clock
const btnShiftX = 200;
const btnShiftY = -200;
const btnLabelFontSize = 16;

const btnOuterPath = d3.arc()
  .innerRadius(btnInnerR)
  .outerRadius(btnOuterR)
  .startAngle(bottom - span)
  .endAngle(bottom - gap);

const btnInnerPath = d3.arc()
  .innerRadius(btnInnerR)
  .outerRadius(btnOuterR)
  .startAngle(bottom + gap)
  .endAngle(bottom + span);

function btnTranslate(xShift, yShift) {
  const dx = Math.cos(bottom) * yShift + xShift;
  const dy = Math.sin(bottom) * yShift;
  return `translate(${cx + dx}, ${cy + dy})`;
}

gBtns.append("path")
  .attr("transform", btnTranslate(btnShiftX, btnShiftY))
  .attr("d", btnOuterPath())
  .attr("fill", OUTER_COLOR)
  .attr("fill-opacity", 0.9)
  .attr("stroke", OUTER_COLOR)
  .attr("stroke-width", 2)
  .style("cursor", "pointer")
  .on("pointerdown", async () => {
    await ensureWarmup();
    playSequence(outerMapped);
  })
  .on("mouseover", function() {
    d3.select(this).attr("fill", d3.color(OUTER_COLOR).brighter(0.8)).attr("filter","url(#glow)");
  })
  .on("mouseout", function() {
    d3.select(this).attr("fill", OUTER_COLOR).attr("fill-opacity", 0.9).attr("filter", null);
  });

gBtns.append("path")
  .attr("transform", btnTranslate(btnShiftX, btnShiftY))
  .attr("d", btnInnerPath())
  .attr("fill", INNER_COLOR)
  .attr("fill-opacity", 0.9)
  .attr("stroke", INNER_COLOR)
  .attr("stroke-width", 2)
  .style("cursor", "pointer")
  .on("pointerdown", async () => {
    await ensureWarmup();
    playSequence(innerMapped);
  })
  .on("mouseover", function() {
    d3.select(this).attr("fill", d3.color(INNER_COLOR).brighter(0.8)).attr("filter","url(#glow)");
  })
  .on("mouseout", function() {
    d3.select(this).attr("fill", INNER_COLOR).attr("fill-opacity", 0.9).attr("filter", null);
  });

/* Button labels (centered near arcs) */
function arcMidpoint(innerR, outerR, a0, a1, xShift=0, yShift=0) {
  const ang = (a0 + a1) / 2;
  const r = (innerR + outerR) / 2;
  const dx = Math.cos(ang) * r + Math.cos(bottom) * yShift + xShift;
  const dy = Math.sin(ang) * r + Math.sin(bottom) * yShift;
  return [cx + dx, cy + dy];
}
// put this right before your two label blocks
const yUnder = cy + Math.sin(bottom) * btnShiftY + btnOuterR + -100; // 24px below the arcs (tweak)
const LABEL_SEP = 80;
{
  const [tx, ty] = arcMidpoint(btnInnerR, btnOuterR, bottom - span, bottom - 1.5, btnShiftX, btnShiftY);
const label = gBtns.append("text")
  .attr("x", tx - LABEL_SEP)
  .attr("y", 360)
  .attr("text-anchor", "middle")
  .attr("font-size", btnLabelFontSize)
  .attr("font-weight", "700")
  .attr("fill", "#525050ff")
  .style("cursor", "pointer")
  .on("pointerdown", async () => { await ensureWarmup(); playSequence(outerMapped); });

label.append("tspan")
  .attr("x", 406)
  .attr("dy", "-5em")
  .attr("text-anchor", "start")
  .text("Standard");

label.append("tspan")
  .attr("x", 440)
  .attr("dy", "1em")
  .attr("text-anchor", "middle")
  .text("Western");

  label.append("tspan")
  .attr("x", 440)
  .attr("dy", "1em")
  .attr("text-anchor", "middle")
  .text("Tuning");

  gBtns.append("text")
  .attr("x", 380).attr("y", 300)
  .attr("font-size", 18).attr("font-weight", "700")
  .text("▶")
    .attr("fill", "#525050ff")
  .style("cursor","pointer")
  .on("pointerdown", async ()=>{ await ensureWarmup(); playSequence(outerMapped); });
}

{
  const [tx, ty] = arcMidpoint(btnInnerR, btnOuterR, bottom + 7.5, bottom + span, btnShiftX, btnShiftY);
  gBtns.append("text")
    .attr("x", tx + LABEL_SEP).attr("text-anchor","start")
    .attr("y", 360) // << was: ty + btnLabelFontSize
    .attr("text-anchor", "middle")
    .attr("font-size", btnLabelFontSize).attr("font-weight", "700").attr("fill", "#525050ff")
    .text(null)
    .html('<tspan x="'+(tx+LABEL_SEP)+'"> Georgian</tspan><tspan x="'+(tx+ 75)+'" dy="1.2em">Tuning</tspan>')

    .attr("dy", "-4.5em")
    .style("cursor", "pointer")
    .on("pointerdown", async () => { await ensureWarmup(); playSequence(innerMapped); });

    gBtns.append("text")
  .attr("x", 510).attr("y", 300)
  .attr("font-size", 18).attr("font-weight", "700")
  .text("▶")
  .attr("fill", "#525050ff")
  .style("cursor","pointer")
  .on("pointerdown", async ()=>{ await ensureWarmup(); playSequence(innerMapped); });
}



/* ===========================
   SEQUENCES — audio-clock scheduling + synced visuals
=========================== */
function highlightOn(node){
  const el = d3.select(node);
  const orig = el.attr("fill");
  el.attr("_origFill", orig);
  el.attr("fill", d3.color(orig).brighter(0.8)).attr("filter", "url(#glow)");
}
function highlightOff(node){
  const el = d3.select(node);
  const orig = el.attr("_origFill") || el.attr("fill");
  el.attr("fill", orig).attr("filter", null);
}

async function playSequence(items) {
  await ensureWarmup();
  const base = Tone.now();
  const dur = 1.0;
  const spacing = 0.5;

  items.slice().sort((a,b) => a.i - b.i).forEach((d, idx) => {
    const t = base + idx * spacing;
    if (d.node) {
      Tone.Draw.schedule(() => highlightOn(d.node), t);
      Tone.Draw.schedule(() => highlightOff(d.node), t + Math.min(dur, 0.5));
    }
    sampler.triggerAttackRelease(d.hz, dur, t);
  });
}