// map.js — responsive D3 map; mounts once on demand
(function () {
  let mounted = false;
  let resizeTimer;

  window.initMap = function (mountSel) {
    if (mounted) return;
    mounted = true;

    const mount = document.querySelector(mountSel);
    if (!mount) {
      console.error("Map mount not found:", mountSel);
      return;
    }

    const tooltip = d3.select("#map-tooltip");

    // Use viewBox for responsiveness
    const VW = 1100, VH = 700;
    const svg = d3
      .select(mount)
      .append("svg")
      .attr("id", "geo-map")                 // for scoped CSS on labels
      .attr("viewBox", `0 0 ${VW} ${VH}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .style("width", "100%")
      .style("height", "auto")
      .style("background-color", "#d0d9cd");

    const defs = svg.append("defs");

    // --- Filters ---------------------------------------------------------
    const raised = defs.append("filter")
      .attr("id", "neumorphic-raised")
      .attr("x", "-40%").attr("y", "-50%")
      .attr("width", "200%").attr("height", "200%");
    raised.append("feDropShadow")
      .attr("dx", "5").attr("dy", "3")
      .attr("stdDeviation", "2")
      .attr("flood-color", "#bebebe");
    raised.append("feDropShadow")
      .attr("dx", "-2").attr("dy", "-2")
      .attr("stdDeviation", "2")
      .attr("flood-color", "#ffffff");

    const pressed = defs.append("filter")
      .attr("id", "neumorphic-pressed")
      .attr("x", "-50%").attr("y", "-50%")
      .attr("width", "200%").attr("height", "200%");
    pressed.append("feDropShadow")
      .attr("dx", "0.5").attr("dy", "0.5")
      .attr("stdDeviation", "0.8")
      .attr("flood-color", "#aaaaaa");
    pressed.append("feDropShadow")
      .attr("dx", "-0.5").attr("dy", "-0.5")
      .attr("stdDeviation", "0.8")
      .attr("flood-color", "#ffffff");

    const glow = defs.append("filter")
      .attr("id", "glow")
      .attr("x", "-50%").attr("y", "-50%")
      .attr("width", "200%").attr("height", "200%");
    glow.append("feGaussianBlur")
      .attr("stdDeviation", "3")
      .attr("result", "coloredBlur");
    const feMerge = glow.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "coloredBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    const gRegions = svg.append("g");
    const gLabels  = svg.append("g");
    const gMacros  = svg.append("g");

    let currentRegion = null;
    let projection, path, regions, geoData;
    const regionIndex = new Map();

    // --- Colors ----------------------------------------------------------
    const regionColors = {
      "Abkhazia": "#b3b3b3", "South Ossetia(Samachablo)": "#b3b3b3", "South-Ossetia": "#b3b3b3",
      "Samegrelo": "#66c2a5", "Imereti": "#66c2a5", "Achara": "#66c2a5", "Guria": "#66c2a5",
      "Svaneti": "#8da0cb", "Racha": "#8da0cb", "Lechkhumi": "#8da0cb",
      "Shida Kartli": "#e5c494", "Kvemo Kartli": "#e5c494", "Kakheti": "#e5c494",
      "Meskhet-Javakheti": "#e5c494", "Tbilisi": "#e5c494",
      "Khevi": "#e78ac3", "Khevsureti": "#e78ac3", "Tusheti": "#e78ac3",
      "Mtiuleti": "#e78ac3", "Pshavi": "#e78ac3", "Ertso Tianeti": "#e78ac3", "Ertso-Tianeti": "#e78ac3"
    };
    const safeColor = name => regionColors[name] || "#eee";

    // --- Pretty labels (only South Ossetia broken into two lines) -------
    const prettyLabels = {
      "Abkhazia": "Abkhazia",
      "South Ossetia(Samachablo)": "South Ossetia\n(Samachablo)",
      "South-Ossetia": "South-Ossetia",
      "Samegrelo": "Samegrelo",
      "Imereti": "Imereti",
      "Achara": "Achara",
      "Guria": "Guria",
      "Svaneti": "Svaneti",
      "Racha": "Racha",
      "Lechkhumi": "Lechkhumi",
      "Shida Kartli": "Shida Kartli",
      "Kvemo Kartli": "Kvemo Kartli",
      "Kakheti": "Kakheti",
      "Meskhet-Javakheti": "Meskhet-Javakheti",
      "Tbilisi": "Tbilisi",
      "Khevi": "Khevi",
      "Khevsureti": "Khevsureti",
      "Tusheti": "Tusheti",
      "Mtiuleti": "Mtiuleti",
      "Pshavi": "Pshavi",
      "Ertso Tianeti": "Ertso Tianeti",
      "Ertso-Tianeti": "Ertso-Tianeti"
    };

    //ეს აკონტროლებს მთიულეთის და ფშავის ლეიბლებს//
    const labelOffsets = {
  "Mtiuleti": { dx: 0,  dy: -12 },   // move up a bit
  "Pshavi":   { dx: 0,  dy:  12 }    // move down a bit
};


    function getLabel(name) {
      return prettyLabels[name] || name;
    }

    // --- Macro groups + label positions ---------------------------------
    const macroGroups = {
      "Western Georgia":      ["Abkhazia","Samegrelo","Guria","Achara","Imereti"],
      "Eastern Georgia":      ["Meskhet-Javakheti","Shida Kartli","Kvemo Kartli","Kakheti","Tbilisi","South Ossetia(Samachablo)","Ertso Tianeti","South-Ossetia","Ertso-Tianeti"],
      "Northeastern regions":["Khevi","Khevsureti","Tusheti","Mtiuleti","Pshavi"],
      "Northwestern regions":["Svaneti","Racha","Lechkhumi"]
    };

    const macroLabelPos = {
      "Western Georgia":       { x: 120,       y: VH - 280 },
      "Eastern Georgia":       { x: VW - 330, y: VH - 10  },
      "Northeastern regions":  { x: VW - 300, y: 200      },
      "Northwestern regions":  { x: 400,      y: 100      }
    };

    // where macro panels prefer to appear (for scroll behaviour)
    const macroPosPref = {
      "Northwestern regions": "top",
      "Northeastern regions": "top",
      "Western Georgia":      "bottom",
      "Eastern Georgia":      "bottom"
    };

    // Text content for macro panels (no titles inside, only body)
    const macroDescriptions = {

      "Western Georgia": 
      `

      <p class="left-align" style="text-align:justify;margin-top: 30px; margin-bottom: 15px;">
       <span style="color:#2e9a78; font-weight:100; font-size:1.25em;">Western Georgia</span> encompasses Samegrelo, Imereti, Guria, and Achara. 
      These regions are known for their more agile and high-pitched singing styles.
        </p>

 <p class="left-align" style="text-align:justify; margin-bottom: 15px;">
        Mingrelian singing is characterized by smoother, more melodic, and sometimes sorrowful tones, yet with a clear rhythmic 
        structure and a sharp, metallic quality in choral pieces.
         </p> 


<p class="left-align" style="text-align:justify; margin-bottom: 15px;">
The Gurian singing tradition is known for its diverse repertoire, featuring both group and trio forms of performance. 
Alternation between trio and group singing is also common. The manner of singing is often sharp and piercing; 
however, some trio songs are performed in a fairly low register with soft vocal delivery.
</p>


<p class="left-align" style="text-align:justify; margin-bottom: 15px;">
      The Imeretian tradition is divided into Upper and Lower Imeretian. 
      The Upper tradition shares sound qualities with Lechkhumi and Kartli, featuring a moderately slower tempo that is both heavy and lively. 
      The Lower Imeretian style is louder and more piercing, though slightly mellower than that of Guria.
        </p>

<p class="left-align" style="text-align:justify; margin-bottom: 15px;"> 
Achara is a region that was historically part of the old Georgian province of Shavsheti. 
Both regions were under long Ottoman occupation, with Shavsheti remaining within modern-day Turkey. 
Folk songs from these areas are primarily two-voiced, though three-voiced singing is also common in Achara. 
<br> Acharian singing practice is characterized by a high-pitched and agile sound, at times resembling the Gurian style but in a less marked manner. 
Complex parallel forms of multi-voiced singing are also typical of this region. 
</p> 

      <p class="left-align" style="text-align:justify; margin-bottom: 15px;">
      <em>Krimanchuli</em> (yodeling) and <em>Gamkivani</em> (mixed voice) appear in Gurian and Acharian songs.
      All these regions feature both choral and trio forms of singing.<br>
      </p>

        <p class="left-align" style="text-align:justify; margin-bottom: 30px;">
        All these regions feature both choral and trio forms.
        </p>
      `,

      "Eastern Georgia": 
      `
      <p class="left-align" style="text-align:justify; margin-top: 30px; margin-bottom: 25px;">
      <span style="color:#cd9138;font-weight:100; font-size:1.25em;">Eastern Georgia</span> Includes Kakheti, Kartli (Shida and Kvemo, meaning inner and lower), and Meskheti-Javakheti.<br>
      </p>

        <p class="left-align" style="text-align:justify; margin-bottom: 25px;">
    Includes Kakheti, Kartli (divided into Shida and Kvemo, meaning inner and lower), and Meskheti-Javakheti.  
    <br>The Eastern tradition unites these provinces, with Kakhetian singing being dominant due to its richness in repertoire and distinctive character. 
    Traditions from these regions share similar features, most notably the use of a drone-like bass and melismatic solo lines.
        </p>  

        <p class="left-align" style="text-align:justify; margin-bottom: 30px;">
    Samtskhe-Javakheti, for its part, unites three historical provinces - Meskheti, Javakheti, and Tori - which are not geographically represented on the current map. 
    Due to prolonged occupation and influence from the Ottoman Empire, the region’s three-part singing tradition experienced a derangement, 
    giving way to two-voiced, drone-based polyphony. 
    The singing style resembles that of Kartli and Kakheti but features fewer melismata and lacks open vocal sounds. 
    </p>
      `,

      "Northwestern regions":
       `
      <p class="left-align" style="text-align:justify; margin-top: 30px; margin-bottom: 5px;">
       <span style="color:#4562a6;font-weight:100; font-size:1.25em;">Northwestern regions</span> would cover Svaneti, together with Racha-Lechkhumi, represents a three-part singing tradition primarily based on choral forms. 
       Round dances (Perkhuli) are typical of all of them, and the forms of performance include group singing, alternation between two groups, and solo singing.
        </p>

        <p class="left-align" style="text-align:justify; margin-bottom: 10px;">
        Svaneti stands out for its distinct sound and linguistic identity, with a strong focus on ritual songs. 
        It is difficult to compare Svanetian music to that of other Georgian regions; 
        however, Rachian and Lechkhumian traditions share a somewhat similar vocal resonance - raw, tense, and dissonant. 
        The singing manner is loud and heavy with ascending and descending pitch-slides. 
        </p>

        <p class="left-align" style="text-align:justify; margin-bottom: 10px;">
        Rachian singing is somewhat similar to the Svanetian style but features a more text-heavy songs and less obvious pitch slides. 
        It is also distinguished by a rapid, trembling vibrato. 
        </p>

        <p class="left-align" style="text-align:justify; margin-bottom: 10px;">
        Lechkhumian singing shares the heaviness of 
        Rachian songs and the mobility of Upper Imeretian traditions, along with more extensive lyrical content. 
        </p>

        <p class="left-align" style="text-align:justify; margin-bottom: 30px;"> 
        All traditions from these regions feature the use of pitch slides. 
        <br> Svan songs and musical instruments are also disseminated throughout Abkhazia. 
        </p>
      `,

      "Northeastern regions":
       `
      <p class="left-align" style="text-align:justify; margin-top: 30px; margin-bottom: 10px;">
        <span style="color:#c3679f;font-weight:100; font-size:1.25em;">Northeastern regions</span> comprises the small regions of Khevsureti, Pshavi, Tusheti, Khevi, Mtiuleti, and Tianeti.
        <br>Many of the regions lie in mountainous areas ranging from 3,200 to 9,200 feet (1,000–2,800 meters) in elevation.
        The so-called Military Road — the only route connecting the northern and southern 
        Caucasus and the sole passage between Russia and Georgia — has passed through this area for centuries.
        <br>Constant transit along this corridor exposed the region to outside influences, which may be reflected in its traditional folk music,
         particularly in the structure of its three-part vocal arrangements. Drone-based singing, in one or two voices, 
        is common in these areas, accompanied by a strong emphasis on regional poetry and the use of string instruments.
        </p>

        <p class="left-align" style="text-align:justify; margin-bottom: 10px;">
        The Mokhevian tradition stands out for preserving Georgian three-voiced, 
        drone-based polyphony, typically performed in a loud and somber vocal tone.
        </p>

        <p class="left-align" style="text-align:justify; margin-bottom: 10px;">
        Khevsureti, Pshavi, and Mtiuleti share a two-voiced drone tradition, often characterized by alternation between two soloists.
        <br> Singing in Khevsureti tends to be tense and forceful, while the Pshavian and Mtiuletian styles are more restrained and nuanced.
        </p>

        <p class="left-align" style="text-align:justify; margin-bottom: 7px;">
         Tianeti, located near Kakheti, displays similarities to Kakhetian singing, including a sharper vocal tone, 
        alternation between top and middle solo lines, and a background drone accompanied by an open, resonant sound. 
        </p>
<p class="left-align" style="text-align:justify; margin-bottom: 30px;"> 
The region of Tusheti, known for its isolation and difficult access,features solo and unison singing in a softer vocal manner, 
often marked by pitch vibration and melismatic ornamentation. 
</p>
      `
    };

    // region descriptions used by audio + list popovers
    const regionDescriptions = {
      Abkhazia: `
        <p style="text-align:justify;"><strong>Voice roles</strong>: two and three-voiced, with upper voice carrying the melody.</p>
        <p style="text-align:justify;"><strong>Sound character</strong>: free rhythm, strong accents, light ornamentation, slides.</p>
        <p style="text-align:justify;"><strong>Singing practice</strong>: one and two-group singing, call-and-response, communal rituals, heroic storytelling.</p>
      `,
      Achara: `
        <p style="text-align:justify;"><strong>Voice roles</strong>: two and three-part polyphony.</p>
        <p style="text-align:justify;"><strong>Sound character</strong>: rhythmic, strong accents, metallic, energetic.</p>
        <p style="text-align:justify;"><strong>Singing practice</strong>: one-group singing, alternation of two groups.</p>
      `,
      Guria: `
        <p style="text-align:justify;"><strong>Voice roles</strong>: three-part, at times can be four-part too.</p>
        <p style="text-align:justify;"><strong>Sound character</strong>: lively, sharp, tense, and luminous; non-lexical syllables, metallic resonance born from close harmonies, syncopated rhythm.</p>
        <p style="text-align:justify;"><strong>Singing practice</strong>: improvised, trios, one and two-group singing, with alternation of two groups, antiphonal.</p>
      `,
      Tianeti: `
        <p style="text-align:justify;"><strong>Voice roles</strong>: two-part and drone-based.</p>
        <p style="text-align:justify;"><strong>Sound character</strong>: strained and piercing, somewhat nasal, with rapid pitch-slides.</p>
        <p style="text-align:justify;"><strong>Singing practice</strong>: alternation of two soloists with the accompaniment of the bass, and solo singing.</p>
      `,
      Imereti: `
        <p style="text-align:justify;"><strong>Voice roles</strong>: three-voiced, two-voiced songs also present.</p>
        <p style="text-align:justify;"><strong>Sound character</strong>: loud and lively, less open sound, sharp and non-sustained.</p>
        <p style="text-align:justify;"><strong>Singing practice</strong>: one-group singing, alternation of trio and a choir, alternation of two groups, and solo singing.</p>
      `,
      "Meskhet-Javakheti": `
        <p style="text-align:justify;"><strong>Voice roles</strong>: mostly two-voiced, drone-based polyphony.</p>
        <p style="text-align:justify;"><strong>Sound character</strong>: belted, sonorous, sung forcefully, less-melismatic.</p>
        <p style="text-align:justify;"><strong>Singing practice</strong>: alternation of three groups, solo and unison singing, round dances, rituals.</p>
      `,
      Kakheti: `
        <p style="text-align:justify;"><strong>Voice roles</strong>: Three-part polyphony with middle voice carrying melody and drone bass.</p>
        <p style="text-align:justify;"><strong>Sound character</strong>: sonorous and fluid, heavily melismatic and ornamental.</p>
        <p style="text-align:justify;"><strong>Singing practice</strong>: mostly one-group singing.</p>
      `,
      Khevi: `
        <p style="text-align:justify;"><strong>Voice roles</strong>: three-voiced and drone-based polyphony.</p>
        <p style="text-align:justify;"><strong>Sound character</strong>: loud, in a heavy and gloomy manner with pitch slides, untempered.</p>
        <p style="text-align:justify;"><strong>Singing practice</strong>: alternation of two groups, solo and unison singing.</p>
      `,
      Khevsureti: `
        <p style="text-align:justify;"><strong>Voice roles</strong>: mainly one-voiced. Drone-based two-voiced singing is also encountered.</p>
        <p style="text-align:justify;"><strong>Sound character</strong>: loud and tense, nasal, rapid slides.</p>
        <p style="text-align:justify;"><strong>Singing practice</strong>: solo and unison singing (in men’s repertoire), alternation of two soloists without bass accompaniment.</p>
      `,
      "Kvemo Kartli": `
        <p style="text-align:justify;">Eastern choral songs with Turkish-Armenian influences.</p>
      `,
      Lechkhumi: `
        <p style="text-align:justify;"><strong>Voice roles</strong>: mainly three-voiced.</p>
        <p style="text-align:justify;"><strong>Sound character</strong>: heavy and lively at the same time, somewhat sustained.</p>
        <p style="text-align:justify;"><strong>Singing practice</strong>: one-group singing, alternation of two groups, and solo singing.</p>
      `,
      Mtiuleti: `
        <p style="text-align:justify;"><strong>Voice roles</strong>: two and three-part, drone-based polyphony.</p>
        <p style="text-align:justify;"><strong>Sound character</strong>: moderately loud, subtle and refined, raw and untempered, with pitch-slides.</p>
        <p style="text-align:justify;"><strong>Singing practice</strong>: moderately melismatic, alternation of two groups.</p>
      `,
      Pshavi: `
        <p style="text-align:justify;"><strong>Voice roles</strong>: two-voiced. Drone-based polyphony.</p>
        <p style="text-align:justify;"><strong>Sound character</strong>: subtle and refined, raw and untempered.</p>
        <p style="text-align:justify;"><strong>Singing practice</strong>: one-group with the alternation of two soloists.</p>
      `,
      Racha: `
        <strong>Rachian tradition</strong>
        <p style="text-align:justify;"><strong>Voice roles</strong>: three and at times four-part polyphony.</p>
        <p style="text-align:justify;"><strong>Sound character</strong>: more fluid, strongly resonant and full-voice singing with pitch slides.</p>
        <p style="text-align:justify;"><strong>Singing practice</strong>: trios, one and two-group singing with diverse thematics: work/harvesting, battle and heroic hymns.</p>
      `,
      Samegrelo: `
        <p style="text-align:justify;"><strong>Voice roles</strong>: three and at times four-part polyphony.</p>
        <p style="text-align:justify;"><strong>Sound character</strong>: more fluid, lyrical, and emotionally melancholic but equally joyful in certain songs.</p>
        <p style="text-align:justify;"><strong>Singing practice</strong>: trios, one and two-group singing with diverse thematics: work/harvesting, battle and heroic hymns.</p>
      `,
      "Shida Kartli": `
        <p style="text-align:justify;"><strong>Voice roles</strong>: three-part polyphony.</p>
        <p style="text-align:justify;"><strong>Sound character</strong>: belted, mellow, melisma still present with moderately slow tempo.</p>
        <p style="text-align:justify;"><strong>Singing practice</strong>: one-group singing, alternation of two groups - antiphonal, work, feast, and heroic songs.</p>
      `,
      Svaneti: `
        <p style="text-align:justify;"><strong>Voice roles</strong>: three-voiced with an active, rhythmically moving bass.</p>
        <p style="text-align:justify;"><strong>Sound character</strong>: dense and rugged with resonant dissonance and pitch slides, robust and full-voice singing but melodic.</p>
        <p style="text-align:justify;"><strong>Singing practice</strong>: ritual and sacred origins; pre-Christian rituals, animist practices, and traditional ceremonies, such as hymns to deities or agricultural rites.</p>
      `,
      Tbilisi: `
        <p style="text-align:justify;"><strong>Voice roles</strong>: solo and multi-voiced (four parts are most common).</p>
        <p style="text-align:justify;"><strong>Sound character</strong>: harmonically refined and warm, mix of Georgian polyphony and urban romance with European influence.</p>
        <p style="text-align:justify;"><strong>Singing practice</strong>: trios, quartets, one-group singing with guitars, sometimes piano.</p>
      `,
      Tusheti: `
        <p style="text-align:justify;">Pastoral tradition with tight polyphony and strong bass.</p>
      `,
      "South Ossetia(Samachablo)": `
        <p style="text-align:justify;"><strong>Voice roles</strong>: mostly two-voiced with three-voiced songs also present.</p>
        <p style="text-align:justify;"><strong>Sound character</strong>: restrained, steady, resonant with minimal ornamentation, melancholic sounds.</p>
        <p style="text-align:justify;"><strong>Singing practice</strong>: one-group singing, along with dance and clapping, instruments.</p>
      `
    };

    // --- Tooltip positioning ---------------------------------------------
    function positionTooltip(evt) {
      const x = (evt.clientX || 0) + window.scrollX + 10;
      const y = (evt.clientY || 0) + window.scrollY - 20;
      tooltip.style("left", `${x}px`).style("top", `${y}px`);
    }

    function fit() {
      if (!geoData) return;
      projection = d3.geoMercator().fitSize([VW, VH], geoData);
      path = d3.geoPath(projection);
      gRegions.selectAll("path").attr("d", path);
      gLabels.selectAll("text.region-label")
        .attr("x", d => path.centroid(d)[0])
        .attr("y", d => path.centroid(d)[1]);
    }

    // ======================= MAIN DATA LOAD ===============================
    d3.json('./Geo_Data/REG_AUD.geojson').then(data => {
      geoData = data;
      fit();

      // --- Regions -------------------------------------------------------
      regions = gRegions.selectAll("path")
        .data(geoData.features)
        .enter()
        .append("path")
        .attr("d", path)
        .attr("fill", d => safeColor(d.properties.name))
        .attr("stroke", "black")
        .attr("stroke-width", 1)
        .attr("filter", "url(#neumorphic-raised)")
        .attr("id", d => d.properties.name);

      regions.each(function (d) {
        regionIndex.set(d.properties.name, d3.select(this));
      });

      regions
        .on("pointerenter", function (event, d) {
          const base = safeColor(d.properties.name);
          d3.select(this)
            .attr("fill", d3.color(base).brighter(0.8))
            .attr("filter", "url(#glow)");
          tooltip.style("display", "block")
            .html(`<strong>${d.properties.name}</strong>`);
          positionTooltip(event);
        })
        .on("pointermove", positionTooltip)
        .on("pointerleave", function (event, d) {
          if (currentRegion !== d.properties.name) {
            d3.select(this)
              .attr("fill", safeColor(d.properties.name))
              .attr("filter", "url(#neumorphic-raised)");
          } else {
            d3.select(this).attr("filter", "url(#neumorphic-pressed)");
          }
          tooltip.style("display", "none");
        })
        .on("click", function (event, d) {
          regions.attr("fill", dd => safeColor(dd.properties.name))
            .attr("filter", "url(#neumorphic-raised)");

          d3.select(this).attr("filter", "url(#neumorphic-pressed)");

          playRegionAudio(d);
        });

      // --- Region labels (on larger shapes) ------------------------------
      gLabels.selectAll("text.region-label")
  .data(geoData.features.filter(f => {
    const b = path.bounds(f);
    const area = (b[1][0] - b[0][0]) * (b[1][1] - b[0][1]);
    return area > 2000;
  }))
  .enter()
  .append("text")
  .attr("class", "region-label")
  .attr("text-anchor", "middle")
  .attr("x", d => {
    const c = path.centroid(d);
    const off = labelOffsets[d.properties.name] || { dx: 0, dy: 0 };
    return c[0] + off.dx;
  })
  .attr("y", d => {
    const c = path.centroid(d);
    const off = labelOffsets[d.properties.name] || { dx: 0, dy: 0 };
    return c[1] + off.dy;
  })
  .each(function(d) {
    const label = getLabel(d.properties.name);
    const lines = label.split("\n");
    const textSel = d3.select(this);

    lines.forEach((line, i) => {
      textSel.append("tspan")
        .attr("x", textSel.attr("x"))
        .attr("dy", i === 0 ? 0 : "1.1em")
        .text(line);
    });
  });


      // --- Glow helpers for macro groups --------------------------------
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
          if (currentRegion === n) {
            sel.attr("fill", safeColor(n)).attr("filter", "url(#neumorphic-pressed)");
          } else {
            sel.attr("fill", safeColor(n)).attr("filter", "url(#neumorphic-raised)");
          }
        });
      }

      // ---------- Macro panels (accordion behaviour) ---------------------
      const macroPanels = new Map();
      let openMacroLabel = null;

      function createMacroPanel(label) {
        if (macroPanels.has(label)) return macroPanels.get(label);

        const panel = document.createElement("div");
        panel.className = "macro-panel";

        const bodyHtml = (macroDescriptions[label] || "").trim();

        // add close button + body
        panel.innerHTML = `
          <button class="macro-close" aria-label="Close macro panel">×</button>
          <div class="macro-panel-body">
            ${bodyHtml}
          </div>
        `;

        // close behaviour for this panel
        const btn = panel.querySelector(".macro-close");
        if (btn) {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();             // don't trigger map clicks
            panel.style.display = "none";
            if (openMacroLabel === label) {
              openMacroLabel = null;
            }
          });
        }

        mount.appendChild(panel);
        macroPanels.set(label, panel);
        return panel;
      }

      function positionMacroPanel(label, svgNode) {
        const panel = macroPanels.get(label);
        if (!panel) return;

        const posPref = macroPosPref[label] || "bottom";

        const mapRect   = mount.getBoundingClientRect();
        const labelRect = svgNode.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();

        // 1️⃣ BASE left
        let left = labelRect.left - mapRect.left + (labelRect.width / 2) - (panelRect.width / 2);
        const minLeft = 9;
        const maxLeft = mapRect.width - panelRect.width - 8;
        if (left < minLeft) left = minLeft;
        if (left > maxLeft) left = maxLeft;

        // 2️⃣ BASE top (depends on "top" / "bottom")
        let top;
        if (posPref === "top") {
          top = (labelRect.top - mapRect.top) - panelRect.height - 12;
          if (top < 8) top = -250;
        } else {
          top = (labelRect.bottom - mapRect.top) + 12;
          const maxTop = mapRect.height - panelRect.height + 100;
          if (top > maxTop) top = maxTop;
        }

        // ⭐ 3️⃣ panel-specific nudge + border color
        const macroOffsets = {
          "Western Georgia":      { dx: -10, dy: 250, border: "#8ebeaeff" },
          "Eastern Georgia":      { dx: 0,   dy: 200, border: "#dfc6a0ff" },
          "Northwestern regions": { dx: 0,   dy: -50, border: "#7f8dabff" },
          "Northeastern regions": { dx: 0,   dy: -70, border: "#cda1bcff" }
        };

        const off = macroOffsets[label] || { dx: 0, dy: 0, border: null };
        left += off.dx;
        top  += off.dy;

        if (off.border) {
          panel.style.border = `3px solid ${off.border}`;
          const closeBtn = panel.querySelector(".macro-close");
          if (closeBtn) {
            // X repeats border color
            closeBtn.style.color = off.border;
            closeBtn.style.borderColor = off.border;
          }
        }

        // 4️⃣ Apply to panel
        panel.style.left = `${left}px`;
        panel.style.top  = `${top}px`;
      }

      function scrollToPanel(panel, posPref = "bottom", duration = 600) {
        const rect = panel.getBoundingClientRect();
        const headerOffset = 80;  // tweak this so the top panel is fully visible
        let targetY;

        if (posPref === "top") {
          // stop with panel nicely below the top (accounting for header/shift)
          targetY = rect.top + window.scrollY - headerOffset;
        } else {
          // "bottom" preference: bring its bottom into view
          const bottomOffset = 20; // small gap at bottom
          targetY = rect.bottom + window.scrollY - window.innerHeight + bottomOffset;
        }

        smoothScrollTo(targetY, duration);
      }

      function smoothScrollTo(targetY, duration) {
        const startY = window.scrollY;
        const diff = targetY - startY;
        const startTime = performance.now();

        function step(now) {
          const t = Math.min((now - startTime) / duration, 1); // 0 → 1
          // simple ease-in-out (optional)
          const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
          window.scrollTo(0, startY + diff * eased);
          if (t < 1) requestAnimationFrame(step);
        }

        requestAnimationFrame(step);
      }

      function openMacroPanel(label, svgNode) {
        // close previous
        if (openMacroLabel && openMacroLabel !== label) {
          const prev = macroPanels.get(openMacroLabel);
          if (prev) prev.style.display = "none";
        }

        const panel = createMacroPanel(label);
        panel.style.display = "block";
        positionMacroPanel(label, svgNode);
        openMacroLabel = label;

        const posPref = macroPosPref[label] || "bottom";
        scrollToPanel(panel, posPref, 900); // 900ms = slower scroll
      }

      function toggleMacroPanel(label, svgNode) {
        const existing = macroPanels.get(label);
        if (existing && existing.style.display === "block") {
          existing.style.display = "none";
          openMacroLabel = null;
          return;
        }
        openMacroPanel(label, svgNode);
      }

      function closeMacroPanelIfAny() {
        if (!openMacroLabel) return;
        const p = macroPanels.get(openMacroLabel);
        if (p) p.style.display = "none";
        openMacroLabel = null;
      }

      // --- Macro labels on SVG (colored like your spans) -----------------
      gMacros.selectAll("text.macro-label")
        .data(Object.keys(macroGroups))
        .enter()
        .append("text")
        .attr("class", "macro-label")
        .attr("x", d => macroLabelPos[d].x)
        .attr("y", d => macroLabelPos[d].y)
        .text(d => d)
        .text(d =>  "▾ " + d)
        .attr("font-size", 22)
        .attr("font-weight", 700)
        .attr("text-anchor", "middle")
        .attr("fill", d => {
          if (d === "Eastern Georgia")      return "#cd9138"; // beige
          if (d === "Western Georgia")      return "#2e9a78"; // green
          if (d === "Northwestern regions") return "#4562a6"; // blue
          if (d === "Northeastern regions") return "#c3679f"; // pink
          return "#525050ff";
        })
        .style("cursor", "pointer")
        .on("pointerenter", (event, label) => {
          glowRegions(macroGroups[label]);
        })
        .on("pointerleave", (event, label) => {
          unglowRegions(macroGroups[label]);
        })
        .on("click", function (event, label) {
          event.stopPropagation();
          toggleMacroPanel(label, this);
        });

      // -------------------- Region list (one column) + single popover ----
      const regionNames = Object.keys(regionDescriptions).sort();
      const listEl = document.getElementById("region-list");
      const popCol = document.getElementById("region-popovers");

      if (listEl && popCol) {
        listEl.innerHTML = "";
        regionNames.forEach(name => {
          const item = document.createElement("div");
          item.className = "region-item";
          item.tabIndex = 0;
          item.textContent = name;
          listEl.appendChild(item);
        });

        let activeItem = null;
        let activePopover = null;

        function popoverHTML(regionName) {
          const body = regionDescriptions[regionName] || "No description available.";
          return `
            <div class="pop-title">${regionName}</div>
            <div class="pop-body">${body}</div>
          `;
        }

        function openPopover(regionName, itemEl) {
          if (activePopover) {
            activePopover.remove();
            activePopover = null;
          }
          if (activeItem) activeItem.classList.remove("is-active");

          const pop = document.createElement("div");
          pop.className = "region-popover";
          pop.innerHTML = popoverHTML(regionName);
          popCol.appendChild(pop);

          const itemRect = itemEl.getBoundingClientRect();
          const colRect  = popCol.getBoundingClientRect();
          const top = itemRect.top - colRect.top;
          pop.style.top = `${top}px`;

          activeItem = itemEl;
          activeItem.classList.add("is-active");
          activePopover = pop;
        }

        function togglePopover(regionName, itemEl) {
          if (activeItem === itemEl && activePopover) {
            activePopover.remove();
            activePopover = null;
            activeItem.classList.remove("is-active");
            activeItem = null;
            return;
          }
          openPopover(regionName, itemEl);
        }

        listEl.addEventListener("click", (e) => {
          const itemEl = e.target.closest(".region-item");
          if (!itemEl) return;
          togglePopover(itemEl.textContent.trim(), itemEl);
        });

        listEl.addEventListener("keydown", (e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          const itemEl = e.target.closest(".region-item");
          if (!itemEl) return;
          e.preventDefault();
          togglePopover(itemEl.textContent.trim(), itemEl);
        });

        function repositionIfOpen() {
          if (!activeItem || !activePopover) return;
          const itemRect = activeItem.getBoundingClientRect();
          const colRect  = popCol.getBoundingClientRect();
          activePopover.style.top = `${itemRect.top - colRect.top}px`;
        }
        window.addEventListener("scroll", repositionIfOpen, { passive: true });
        window.addEventListener("resize", repositionIfOpen);
      }

      // ===================================================================
      // Fit map on resize
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(fit, 120);
      });
    })
    .catch(error => console.error("Error loading GeoJSON:", error));

    // ======================== AUDIO PLAYER (GROUPED) ======================
    const audioPlayerContainer = document.getElementById("audio-player-container");
    const audioElement         = document.getElementById("custom-audio");
    const nowPlaying           = document.getElementById("now-playing");
    const descriptionEl        = document.getElementById("region-description");
    const closeBtn             = document.getElementById("close-player");

    const regionSuffix = {
      Svaneti: "▾ Svanetian(<em>Svanuri</em>,<span class='ka'> სვანური</span>)",
      Samegrelo: "▾ Mingrelian(<em>Megruli</em>,<span class='ka'> მეგრული</span>)",
      Guria: "▾ Gurian(<em>Guruli</em>,<span class='ka'> გურული</span>)",
      Racha: "▾ Rachian(<em>Rachuli</em>,<span class='ka'> რაჭული</span>)",
      Lechkhumi: "▾ Lechkhumian(<em>Lechkhumuri</em>,<span class='ka'> ლეჩხუმური</span>)",
      Imereti: "▾ Imeretian(<em>Imeruli</em>,<span class='ka'> იმერული</span>)",
      Kakheti: "▾ Kakhetian(<em>Kakhuri</em>,<span class='ka'> კახური</span>)",
      Tusheti: "▾ Tushetian(<em>Tushuri</em>,<span class='ka'> თუშური</span>)",
      Khevsureti: "▾ Khevsurian(<em>Khevsuruli</em>,<span class='ka'> ხევსურული</span>)",
      Khevi: "▾ Mokhevian(<em>Mokheuri</em>,<span class='ka'> მოხეური</span>)",
      Pshavi: "▾ Pshavian(<em>Pshauri</em>,<span class='ka'> ფშაური</span>)",
      Achara: "▾ Acharian(<em>Acharuli</em>,<span class='ka'> ჭარული</span>)",
      "Kvemo Kartli": "▾ Kartlian(<em>Kartluri</em>,<span class='ka'> ქართლური</span>)",
      "Ertso-Tianeti": "▾ Tianetian(<em>Tianuri</em>,<span class='ka'> თიანური</span>)",
      "Meskhet-Javakheti": "▾ Meskhetian(<em>Meskhuri</em>,<span class='ka'> მესხური</span>)",
      "South Ossetia(Samachablo)": "▾ Ossetian(<em>Iron </em>, <em>Ирон</em>, <span class='ka'> ოსური</span>)",
      Abkhazia: "▾ Abkhazian(<em>Abkhazuri</em>,<span class='ka'> აფხაზური</span>)",
      Tbilisi: "▾ Urban(<em>Kalakuri</em>,<span class='ka'> ქალაქური</span>)",
      Mtiuleti: "▾ Mtiulian(<em>Mtiuluri</em>,<span class='ka'> მთიულური</span>)",
      "Shida Kartli": "▾ Kartlian(<em>Kartluri</em>,<span class='ka'> ქართლური</span>)"
      // add only the ones you want special names for
    };

    function playRegionAudio(d) {
      if (!audioPlayerContainer || !audioElement || !nowPlaying) return;
      const src = d.properties && d.properties.audio;
      if (!src) return;

      audioElement.src = src;
      audioElement.play();
      audioPlayerContainer.style.display = "block";   // or "flex" if you prefer

      nowPlaying.textContent =
        `Now Playing: "${d.properties.title}" by ${d.properties.artist} (${d.properties.name})`;

      // 🔹 HEADER TEXT + COLOR (this is where your block goes)
      const headerEl = document.getElementById("audio-accordion-header");
      if (headerEl) {
        const name   = d.properties.name;
        const suffix = regionSuffix[name] || name;
        headerEl.innerHTML = `${suffix} Tradition`;

        // --- COLOR BY MACROREGION ---
        if (["Abkhazia","Samegrelo","Guria","Achara","Imereti"].includes(name)) {
          headerEl.style.color = "#2e9a78";      // Western Georgia (green)
        }
        else if (["Shida Kartli","Kvemo Kartli","Kakheti","Tbilisi","Meskhet-Javakheti","South Ossetia(Samachablo)","Ertso-Tianeti"].includes(name)) {
          headerEl.style.color = "#cd9138";      // Eastern Georgia (beige/gold)
        }
        else if (["Svaneti","Racha","Lechkhumi"].includes(name)) {
          headerEl.style.color = "#4562a6";      // Northwestern regions (blue)
        }
        else if (["Khevi","Khevsureti","Tusheti","Mtiuleti","Pshavi"].includes(name)) {
          headerEl.style.color = "#c3679f";      // Northeastern regions (pink)
        }
        else {
          headerEl.style.color = "#202020";      // fallback
        }
      }

      // 🔹 DESCRIPTION TEXT
      if (descriptionEl) {
        const desc = regionDescriptions[d.properties.name];
        descriptionEl.innerHTML = desc || "No description available for this region yet.";
      }

      currentRegion = d.properties.name;

      // 🔹 SIMPLE MACRO BORDER CONTROL (you already had this)
      const r = d.properties.name;

      if (["Abkhazia","Samegrelo","Guria","Achara","Imereti"].includes(r)) {
        audioPlayerContainer.style.border = "3px solid #8ebeaeff";
      } 
      else if (["Javakheti","Shida Kartli","Kvemo Kartli","Kakheti","Tbilisi","South Ossetia(Samachablo)","Ertso-Tianeti"].includes(r)) {
        audioPlayerContainer.style.border = "3px solid #dfc6a0ff";
      }
      else if (["Svaneti","Racha","Lechkhumi"].includes(r)) {
        audioPlayerContainer.style.border = "3px solid #7f8dabff";
      }
      else if (["Khevi","Khevsureti","Tusheti","Mtiuleti","Pshavi"].includes(r)) {
        audioPlayerContainer.style.border = "3px solid #cda1bcff";
      }
    }

    function closeAudioPlayer() {
      if (!audioPlayerContainer || !audioElement) return;
      audioElement.pause();
      audioElement.currentTime = 0;
      audioPlayerContainer.style.display = "none";
    }

    if (closeBtn) {
      closeBtn.addEventListener("click", closeAudioPlayer);
    }

    // ====================== /AUDIO PLAYER (GROUPED) =======================
  };
})();
