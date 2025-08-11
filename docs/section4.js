import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import * as Tone from "https://cdn.jsdelivr.net/npm/tone@14.7.77/+esm";

// =======================
// AUDIO SETUP
// =======================
const samples = {
  "E_base": { url: "https://tonejs.github.io/audio/salamander/Fs3.mp3", hz: 185.00 },
  "D_base": { url: "https://tonejs.github.io/audio/salamander/Fs3.mp3", hz: 185.00 },
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

const data = [
  { note: 'E', westernHz: 164.81, georgianHz: 162.09, bufferKey: 'D#4' },
  { note: 'D', westernHz: 146.83, georgianHz: 150.37, bufferKey: 'D#4' },
  { note: 'C', westernHz: 130.81, georgianHz: 132.45, bufferKey: 'C4' }
];

// =======================
// SVG SETUP
// =======================
const width = 1800;
const height = 2000;

const svg = d3.select('#section4')
  .append('svg')
  .attr('width', width)
  .attr('height', height)
  .attr('viewBox', `-2300 -2000 4000 4000`)
  .attr('preserveAspectRatio', 'xMidYMid meet')
  .style('background-color', '#d0d9cd');

// Add tooltip div
const tooltip = d3.select('body')
  .append('div')
  .style('position', 'absolute')
  .style('background', 'rgba(0, 0, 0, 0.8)')
  .style('color', 'white')
  .style('padding', '8px')
  .style('border-radius', '4px')
  .style('pointer-events', 'none')
  .style('opacity', 0)
  .style('font-size', '12px');

const scaleFactor = 2.9;
const chartX = 350;
const chartY = -800;

const center = svg.append('g')
  .attr(
    'transform',
    `translate(${chartX}, ${chartY}) scale(${scaleFactor}) skewX(-25) scale(1,0.6)`
  );

// =======================
// DIMENSIONS
// =======================
const totalSections = 8;
const halfAngle = Math.PI;
const eachAngle = halfAngle / totalSections;
const maxOuterRadius = 600;
const minInnerRadius = 0;

const noteAngles = {
  'C': Math.PI - 0.3 * eachAngle,
  'D': Math.PI - 3.1 * eachAngle,
  'E': Math.PI - 4.4 * eachAngle
};

// =======================
// BAR SHAPES
// =======================
const createBar = (innerR, outerR, centerAngle) => {
  const widthAngle = eachAngle * 0.4;
  const corrected = (2.5 * Math.PI) - centerAngle;
  return d3.arc()
    .innerRadius(innerR)
    .outerRadius(outerR)
    .startAngle(corrected - widthAngle / 2)
    .endAngle(corrected + widthAngle / 2);
};

function getAngleOffset(d) {
  const cents = 1200 * Math.log2(d.georgianHz / d.westernHz);
  return (cents / 100) * eachAngle;
}

// =======================
// PLAYBACK WITH HIGHLIGHT
// =======================
async function playChord(notes, georgian = false) {
  await Tone.start();
  const now = Tone.now();
  const className = georgian ? '.georgian' : '.western';
  const highlightColor = georgian ? 'rgba(128, 0, 128, 0.8)' : 'rgba(0, 255, 255, 0.8)';
  const delay = 1000;

  notes.forEach((d, i) => {
    setTimeout(() => {
      const bar = d3.selectAll(className).filter(dd => dd.note === d.note);
      const originalFill = bar.attr('fill');

      bar.transition().duration(100)
        .attr('fill', highlightColor)
        .attr('opacity', 1);

      setTimeout(() => {
        bar.transition().duration(300)
          .attr('fill', originalFill)
          .attr('opacity', 0.9);
      }, delay - 100);
    }, i * delay);

    const westernKeys = { E: "E_base", D: "D_base", C: "C3" };
    const key = georgian ? d.bufferKey : westernKeys[d.note];
    const buffer = buffers[key];
    const baseHz = samples[key].hz;
    const targetHz = georgian ? d.georgianHz : d.westernHz;

    if (buffer) {
      const player = new Tone.Player(buffer).toDestination();
      player.playbackRate = targetHz / baseHz;
      player.start(now + i * (delay / 1000));
    }
  });
}

// =======================
// DRAW BARS
// =======================
center.selectAll('.western')
  .data(data)
  .enter()
  .append('path')
  .attr('class', 'western')
  .attr('d', d => createBar(minInnerRadius, maxOuterRadius * 0.88, noteAngles[d.note])(d))
  .attr('fill', 'rgba(8, 157, 157, 0.3)')
  .attr('stroke', 'rgba(8, 157, 157, 0.3)')
  .attr('opacity', 0.9)
  .style('cursor', 'pointer')
  .on('mouseover', function(event, d) {
    d3.select(this)
      .transition()
      .duration(200)
      .attr('fill', 'rgba(8, 157, 157, 0.8)')
      .attr('opacity', 1);
    
    tooltip.transition()
      .duration(200)
      .style('opacity', 0.9);
    
    tooltip.html(`Note: ${d.note}<br>Western: ${d.westernHz.toFixed(2)} Hz<br>Georgian: ${d.georgianHz.toFixed(2)} Hz`)
      .style('left', (event.pageX + 10) + 'px')
      .style('top', (event.pageY - 28) + 'px');
  })
  .on('mouseout', function() {
    d3.select(this)
      .transition()
      .duration(200)
      .attr('fill', 'rgba(8, 157, 157, 0.3)')
      .attr('opacity', 0.9);
    
    tooltip.transition()
      .duration(200)
      .style('opacity', 0);
  })
  .on('click', (event, d) => playChord([d], false));

center.selectAll('.georgian')
  .data(data)
  .enter()
  .append('path')
  .attr('class', 'georgian')
  .attr('d', d => {
    const outer = maxOuterRadius * 0.83;
    const angle = noteAngles[d.note] - getAngleOffset(d);
    return createBar(minInnerRadius, outer, angle)(d);
  })
  .attr('fill', 'rgba(128,0,128,0.3)')
  .attr('stroke', 'rgba(128,0,128,0.3)')
  .attr('opacity', 0.9)
  .style('cursor', 'pointer')
  .on('mouseover', function(event, d) {
    d3.select(this)
      .transition()
      .duration(200)
      .attr('fill', 'rgba(128, 0, 128, 0.8)')
      .attr('opacity', 1);
    
    tooltip.transition()
      .duration(200)
      .style('opacity', 0.9);
    
    tooltip.html(`Note: ${d.note}<br>Western: ${d.westernHz.toFixed(2)} Hz<br>Georgian: ${d.georgianHz.toFixed(2)} Hz`)
      .style('left', (event.pageX + 10) + 'px')
      .style('top', (event.pageY - 28) + 'px');
  })
  .on('mouseout', function() {
    d3.select(this)
      .transition()
      .duration(200)
      .attr('fill', 'rgba(128,0,128,0.3)')
      .attr('opacity', 0.9);
    
    tooltip.transition()
      .duration(200)
      .style('opacity', 0);
  })
  .on('click', (event, d) => playChord([d], true));

// =======================
// AXES AND LABELS
// =======================
['C','D','E'].forEach(note => {
  const angle = noteAngles[note];
  center.append('line')
    .attr('x1', 0).attr('y1', 0)
    .attr('x2', Math.cos(angle) * maxOuterRadius)
    .attr('y2', -Math.sin(angle) * maxOuterRadius)
    .attr('stroke', 'black')
    .attr('stroke-width',1)
    .attr('stroke-opacity', 0.3);
});

['C','D','E'].forEach(note => {
  const angle = noteAngles[note];
  center.append('text')
    .attr('x', Math.cos(angle) * (maxOuterRadius + 20))
    .attr('y', -Math.sin(angle) * (maxOuterRadius + 20))
    .attr('text-anchor', 'middle')
    .text(note)
    .attr('fill', 'gray')
    .style('font-size', '60px');
});

// =======================
// BUTTONS
// =======================
const buttonHeight = 200;
const buttonWidth = 300;
const buttonSpacing = 400;
const buttonY = -700;
const westernX = -800;
const georgianX = 100;

function pressEffect(rect) {
  rect.transition().duration(80).attr('transform', 'scale(0.95)');
  setTimeout(() => rect.transition().duration(80).attr('transform', 'scale(1)'), 120);
}

function addButton(x, color, label, georgian) {
  const rect = svg.append('rect')
    .attr('x', x)
    .attr('y', buttonY)
    .attr('width', buttonWidth)
    .attr('height', buttonHeight)
    .attr('rx', 20)
    .attr('ry', 20)
    .attr('fill', color)
    .attr('stroke', 'rgba(8, 157, 157, 0.3)')
    .attr('stroke-width', 2.5)
    .style('cursor', 'pointer')
    .on('mouseover', function() {
      d3.select(this)
        .transition()
        .duration(200)
        .attr('fill', georgian ? 'rgba(128, 0, 128, 0.8)' : 'rgba(8, 157, 157, 0.8)')
        .attr('opacity', 1);
    })
    .on('mouseout', function() {
      d3.select(this)
        .transition()
        .duration(200)
        .attr('fill', color)
        .attr('opacity', 0.9);
    })
    .on('click', function () {
      pressEffect(d3.select(this));
      playChord(data, georgian);
    });

  svg.append('text')
    .attr('x', x + buttonWidth / 2)
    .attr('y', buttonY + buttonHeight / 2 + 5)
    .attr('text-anchor', 'middle')
    .style('font-size', '25px')
    .style('font-weight', '600')
    .style('cursor', 'pointer')
    .style('fill', '#0b4d42')
    .text(label)
    .on('mouseover', function() {
      d3.select(this)
        .transition()
        .duration(200)
        .style('fill', 'rgba(69, 72, 72, 1)');
    })
    .on('mouseout', function() {
      d3.select(this)
        .transition()
        .duration(200)
        .style('fill', 'rgba(69, 72, 72, 0.86)');
    })
    .on('click', () => {
      pressEffect(rect);
      playChord(data, georgian);
    });
}

addButton(westernX, 'rgba(8, 157, 157, 0.3)', 'Play Western Chord', false);
addButton(georgianX, 'rgba(128, 0, 128, 0.3)', 'Play Georgian Chord', true);