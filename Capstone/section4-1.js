// georgian-western-scale-half-fan.js
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import * as Tone from "https://cdn.jsdelivr.net/npm/tone@14.7.77/+esm";

// Audio samples
const samples = {
  "G_base": { url: "https://tonejs.github.io/audio/salamander/Fs3.mp3", hz: 196.00 },
  "F_base": { url: "https://tonejs.github.io/audio/salamander/Fs3.mp3", hz: 174.61 },
  "C3": { url: "https://tonejs.github.io/audio/salamander/C3.mp3", hz: 130.81 },
  "D#4": { url: "https://tonejs.github.io/audio/salamander/Ds4.mp3", hz: 311.13 },
  "C4": { url: "https://tonejs.github.io/audio/salamander/C4.mp3", hz: 261.63 }
};

const buffers = {};
async function loadBuffers() {
  for (const note of Object.keys(samples)) {
    buffers[note] = await new Tone.ToneAudioBuffer(samples[note].url);
  }
}
loadBuffers();

// Data
const data = [
  { note: 'G', westernHz: 196.00, georgianHz: 195.185625, bufferKey: 'D#4' },
  { note: 'F', westernHz: 174.61, georgianHz: 177.354800, bufferKey: 'D#4' },
  { note: 'C', westernHz: 130.81, georgianHz: 131.168065, bufferKey: 'C4' }
];

// SVG setup
const width = 1200;
const height = 800;
const svg = d3.select('#section4')
  .append('svg')
  .attr('width', width)
  .attr('height', height)
  .attr('viewBox', `0 0 ${width} ${height}`)
  .attr('preserveAspectRatio', 'xMidYMid meet')
  .style('background-color', 'd0d9cd');

const center = svg.append('g')
  .attr('transform', `translate(${width / 2}, ${height / 1.2})`);

const totalSections = 8;
const halfAngle = Math.PI;
const eachAngle = halfAngle / totalSections;
const maxOuterRadius = (width / 2) * 0.9;
const minInnerRadius = 0;

// Note base angles
const noteAngles = {
  'C': Math.PI - 0 * eachAngle,
  'F': Math.PI - 3 * eachAngle,
  'G': Math.PI - 4 * eachAngle
};

// Arc generator
const createBar = (innerR, outerR, centerAngle) => {
  const widthAngle = eachAngle * 0.3;
  const corrected = (2.5 * Math.PI) - centerAngle;
  return d3.arc()
    .innerRadius(innerR)
    .outerRadius(outerR)
    .startAngle(corrected - widthAngle / 2)
    .endAngle(corrected + widthAngle / 2);
};

// Dynamic offset from Hz
function getAngleOffset(d) {
  const gHz = Number(d.georgianHz);
  const wHz = Number(d.westernHz);
  if (!gHz || !wHz || gHz <= 0 || wHz <= 0) return 0;
  const cents = 1200 * Math.log2(gHz / wHz);
  return (cents / 100) * eachAngle;
}

// Playback
async function playChord(notes, georgian = false) {
  await Tone.start();
  const now = Tone.now();
  notes.forEach((d, i) => {
    const westernKeys = { G: "G_base", F: "F_base", C: "C3" };
    const key = georgian ? d.bufferKey : westernKeys[d.note];
    const buffer = buffers[key];
    const baseHz = samples[key].hz;
    const targetHz = georgian ? d.georgianHz : d.westernHz;
    if (buffer) {
      const player = new Tone.Player(buffer).toDestination();
      if (!georgian) {
        if (d.note === "G") player.playbackRate = 1.059;
        else if (d.note === "F") player.playbackRate = 0.944;
        else player.playbackRate = 1;
      } else {
        player.playbackRate = targetHz / baseHz;
      }
      player.start(now + i * 1);
    }
  });
}

// Western bars
center.selectAll('.western')
  .data(data)
  .enter()
  .append('path')
  .attr('class', 'western')
  .attr('d', d => {
    const angle = noteAngles[d.note];
    const outer = maxOuterRadius * 0.85;
    const bar = createBar(minInnerRadius, outer, angle);
    return bar(d);
  })
  .attr('fill', 'rgba(8, 157, 157, 0.3)')
  .attr('stroke', 'rgba(8, 157, 157, 0.3)')
  .style('cursor', 'pointer')
  .on('click', (event, clickedNote) => playChord([clickedNote], false));

// Georgian bars (subtract offset → rightward)
center.selectAll('.georgian')
  .data(data)
  .enter()
  .append('path')
  .attr('class', 'georgian')
  .attr('d', d => {
    const base = noteAngles[d.note];
    const angle = base - getAngleOffset(d);
    const outer = maxOuterRadius * 0.8;
    const bar = createBar(minInnerRadius, outer, angle);
    return bar(d);
  })
  .attr('fill', 'rgba(128,0,128,0.3)')
  .attr('stroke', 'rgba(128,0,128,0.3)')
  .style('cursor', 'pointer')
  .on('click', (event, clickedNote) => playChord([clickedNote], true));

// Western frequency labels
center.selectAll('.western-label')
  .data(data)
  .enter()
  .append('text')
  .attr('x', d => Math.cos(noteAngles[d.note]) * (maxOuterRadius + 20))
  .attr('y', d => -Math.sin(noteAngles[d.note]) * (maxOuterRadius + -100))
  .text(d => `${d.westernHz.toFixed(2)} Hz`)
  .attr('fill', 'gray')
  .style('font-size', '22px')
  .attr('text-anchor', 'middle');

// Georgian frequency labels
center.selectAll('.georgian-label')
  .data(data)
  .enter()
  .append('text')
  .attr('x', d => {
    const angle = noteAngles[d.note] - getAngleOffset(d);
    return Math.cos(angle) * (maxOuterRadius + 60);
  })
  .attr('y', d => {
    const angle = noteAngles[d.note] - getAngleOffset(d);
    return -Math.sin(angle) * (maxOuterRadius + 0);
  })
  .text(d => `${d.georgianHz.toFixed(2)} Hz`)
  .attr('fill', 'purple')
  .style('font-size', '10px')
  .attr('text-anchor', 'middle');

// Axes lines
for (let i = 0; i <= totalSections; i++) {
  const angle = i * eachAngle;
  center.append('line')
    .attr('x1',0).attr('y1', 0)
    .attr('x2', Math.cos(angle) * maxOuterRadius)
    .attr('y2', -Math.sin(angle) * maxOuterRadius)
    .attr('stroke', 'black').attr('stroke-opacity', 0.18);
}

// Note labels
['C', 'F', 'G'].forEach(note => {
  const angle = noteAngles[note];
  center.append('text')
    .attr('x', Math.cos(angle) * (maxOuterRadius + 20))
    .attr('y', -Math.sin(angle) * (maxOuterRadius + 20))
    .attr('text-anchor', 'middle')
    .text(note)
    .attr('fill', 'gray')
    .style('font-size', '60px');
});

// =====================
// BUTTONS AT BOTTOM
// =====================
const buttonHeight = 40;
const buttonWidth = width / 2;
const buttonY = height - buttonHeight - 10;

// Western button
svg.append('rect')
  .attr('x', 0)
  .attr('y', buttonY)
  .attr('width', buttonWidth)
  .attr('height', buttonHeight)
  .attr('fill', 'rgba(8, 157, 157, 0.3)')
  .attr('stroke', 'rgba(8, 157, 157, 0.3)')
  .style('cursor', 'pointer')
  .on('click', () => playChord(data, false));

svg.append('text')
  .attr('x', buttonWidth / 2)
  .attr('y', buttonY + buttonHeight / 2 + 5)
  .attr('text-anchor', 'middle')
  .style('font-size', '14px')
  .style('cursor', 'pointer')
  .text('Play Western Chord')
  .on('click', () => playChord(data, false));

// Georgian button
svg.append('rect')
  .attr('x', buttonWidth)
  .attr('y', buttonY)
  .attr('width', buttonWidth)
  .attr('height', buttonHeight)
  .attr('fill', 'rgba(128,0,128,0.3)')
  .attr('stroke', 'rgba(128,0,128,0.3)')
  .style('cursor', 'pointer')
  .on('click', () => playChord(data, true));

svg.append('text')
  .attr('x', buttonWidth + buttonWidth / 2)
  .attr('y', buttonY + buttonHeight / 2 + 5)
  .attr('text-anchor', 'middle')
  .style('font-size', '14px')
  .style('cursor', 'pointer')
  .text('Play Georgian Chord')
  .on('click', () => playChord(data, true));