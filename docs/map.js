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
      "Eastern Georgia":      ["Meskhet-Javakheti","Shida Kartli","Kvemo Kartli","Kakheti","Tbilisi","South Ossetia(Samachablo)","South-Ossetia"],
      "Northeastern regions":["Khevi","Khevsureti","Tusheti","Mtiuleti","Pshavi","Ertso Tianeti","Ertso-Tianeti"],
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
      "Western Georgia": `
      <p class="left-align" style="text-align:justify;margin-top: 30px; margin-bottom: 25px;">
       <span style="color:#2e9a78; font-weight:100; font-size:1.25em;">Western Georgia</span>
       </p>
       <p>
      encompasses Samegrelo, Imereti, Guria, and Achara.
      These regions are known for their more agile and high-pitched singing styles.
        </p>

 <p class="left-align" style="text-align:justify; margin-bottom: 15px;">
        <strong>Mingrelian</strong> singing is characterized by smoother, more melodic, and sometimes sorrowful tones, yet with a clear rhythmic
        structure and a sharp, metallic quality in choral pieces.
         </p>

<p class="left-align" style="text-align:justify; margin-bottom: 15px;">
The <strong>Gurian</strong> singing tradition is known for its diverse repertoire, featuring both group and trio forms of performance.
Alternation between trio and group singing is also common. The manner of singing is often sharp and piercing;
however, some trio songs are performed in a fairly low register with soft vocal delivery.
</p>

<p class="left-align" style="text-align:justify; margin-bottom: 15px;">
      The <strong>Imeretian</strong> tradition is divided into Upper and Lower Imeretian.
      The Upper tradition shares sound qualities with Lechkhumi and Kartli, featuring a moderately slower tempo that is both heavy and lively.
      The Lower Imeretian style is louder and more piercing, though slightly mellower than that of Guria.
        </p>

<p class="left-align" style="text-align:justify; margin-bottom: 15px;">
<strong>Achara</strong> is a region that was historically part of the old Georgian province of Shavsheti.
Both regions were under long Ottoman occupation, with Shavsheti remaining within modern-day Turkey.
Folk songs from these areas are primarily two-voiced, though three-voiced singing is also common in Achara.
 Acharian singing practice is characterized by a high-pitched and agile sound, at times resembling the Gurian style but in a less marked manner.
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

      "Eastern Georgia": `
      <p class="left-align" style="text-align:justify; margin-top: 30px; margin-bottom: 25px;">
      <span style="color:#cd9138;font-weight:100; font-size:1.25em;">Eastern Georgia</span>
      </p>

        <p class="left-align" style="text-align:justify; margin-bottom: 25px;">
    Includes <strong>Kakheti</strong>, <strong>Kartli</strong> (divided into Shida and Kvemo,
    meaning inner and lower), and <strong>Meskhet-Javakheti</strong>.
    <br>The Eastern tradition unites these provinces, with Kakhetian singing being dominant due to its richness in repertoire and distinctive character.
    Traditions from these regions share similar features, most notably the use of a drone-like bass and melismatic solo lines.
        </p>

        <p class="left-align" style="text-align:justify; margin-bottom: 30px;">
    <strong>Meskhet-Javakheti</strong>, for its part, unites three historical provinces - Meskheti, Javakheti, and Tori - which are not geographically represented on the current map.
    Due to prolonged occupation and influence from the Ottoman Empire, the region’s three-part singing tradition experienced a derangement,
    giving way to two-voiced, drone-based polyphony.
    The singing style resembles that of Kartli and Kakheti but features fewer melismata and lacks open vocal sounds.
    </p>
      `,

      "Northwestern regions": `
      <p class="left-align" style="text-align:justify; margin-top: 30px; margin-bottom: 25px;">
       <span style="color:#4562a6;font-weight:100; font-size:1.25em;">Northwestern regions</span>
       </p>
       <p>
       comprise Svaneti, together with Racha-Lechkhumi, represents a three-part singing tradition primarily based on choral forms.
       Round dances (Perkhuli) are typical of all of them, and the forms of performance include group singing, alternation between two groups, and solo singing.
        </p>

        <p class="left-align" style="text-align:justify; margin-bottom: 10px;">
        <strong>Svaneti</strong> stands out for its distinct sound and linguistic identity, with a strong focus on ritual songs.
        It is difficult to compare Svanetian music to that of other Georgian regions;
        however, Rachian and Lechkhumian traditions share a somewhat similar vocal resonance - raw, tense, and dissonant.
        The singing manner is loud and heavy with ascending and descending pitch-slides.
        </p>

        <p class="left-align" style="text-align:justify; margin-bottom: 10px;">
        <strong>Rachian</strong> singing is somewhat similar to the Svanetian style but features a more text-heavy songs and less obvious pitch slides.
        It is also distinguished by a rapid, trembling vibrato.
        </p>

        <p class="left-align" style="text-align:justify; margin-bottom: 10px;">
        <strong>Lechkhumian</strong> singing shares the heaviness of
        Rachian songs and the mobility of Upper Imeretian traditions, along with more extensive lyrical content.
        </p>

        <p class="left-align" style="text-align:justify; margin-bottom: 30px;">
        All traditions from these regions feature the use of pitch slides.
        <br> Svan songs and musical instruments are also disseminated throughout Abkhazia.
        </p>
      `,

      "Northeastern regions": `
      <p class="left-align" style="text-align:justify; margin-top: 30px; margin-bottom: 10px;">
        <span style="color:#c3679f;font-weight:100; font-size:1.25em;">Northeastern regions</span>
        </p>
        <p>
        comprise the small regions of Khevsureti, Pshavi, Tusheti, Khevi, Mtiuleti, and Tianeti.
        <br>Many of the regions lie in mountainous areas ranging from 3,200 to 9,200 feet (1,000–2,800 meters) in elevation.
        The so-called Military Road — the only route connecting the northern and southern
        Caucasus and the sole passage between Russia and Georgia — has passed through this area for centuries.
        <br>Constant transit along this corridor exposed the region to outside influences, which may be reflected in its traditional folk music,
         particularly in the structure of its three-part vocal arrangements. Drone-based singing, in one or two voices,
        is common in these areas, accompanied by a strong emphasis on regional poetry and the use of string instruments.
        </p>

        <p class="left-align" style="text-align:justify; margin-bottom: 10px;">
        The <strong>Mokhevian</strong> tradition stands out for preserving Georgian three-voiced,
        drone-based polyphony, typically performed in a loud and somber vocal tone.
        </p>

        <p class="left-align" style="text-align:justify; margin-bottom: 10px;">
        <strong>Khevsureti</strong>, <strong>Pshavi</strong>, and <strong>Mtiuleti</strong> share a two-voiced drone tradition, often characterized by alternation between two soloists.
        <br> Singing in Khevsureti tends to be tense and forceful, while the Pshavian and Mtiuletian styles are more restrained and nuanced.
        </p>

        <p class="left-align" style="text-align:justify; margin-bottom: 7px;">
         <strong>Tianeti</strong>, located near Kakheti, displays similarities to Kakhetian singing, including a sharper vocal tone,
        alternation between top and middle solo lines, and a background drone accompanied by an open, resonant sound.
        </p>
<p class="left-align" style="text-align:justify; margin-bottom: 30px;">
The region of <strong>Tusheti</strong>, known for its isolation and difficult access,features solo and unison singing in a softer vocal manner,
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

    function fit() {
      if (!geoData) return;
      projection = d3.geoMercator().fitSize([VW, VH], geoData);
      path = d3.geoPath(projection);
      gRegions.selectAll("path").attr("d", path);
      gLabels.selectAll("text.region-label")
        .attr("x", d => path.centroid(d)[0])
        .attr("y", d => path.centroid(d)[1]);
    }

    // map from macro label text => SVG text node (for arrow flipping)
    const macroLabelNodes = new Map();

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
        .attr("id", d => d.properties.name)
        .style("cursor", "pointer");

      regions.each(function (d) {
        regionIndex.set(d.properties.name, d3.select(this));
      });

      regions
        .on("pointerenter", function (event, d) {
          const base = safeColor(d.properties.name);
          d3.select(this)
            .attr("fill", d3.color(base).brighter(0.8))
            .attr("filter", "url(#glow)");
        })
        .on("pointerleave", function (event, d) {
          if (currentRegion !== d.properties.name) {
            d3.select(this)
              .attr("fill", safeColor(d.properties.name))
              .attr("filter", "url(#neumorphic-raised)");
          } else {
            d3.select(this).attr("filter", "url(#neumorphic-pressed)");
          }
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
      // ---------- Macro panels (accordion behaviour) ---------------------
const macroPanels = new Map();
let openMacroLabel = null;

function createMacroPanel(label) {
  if (macroPanels.has(label)) return macroPanels.get(label);

  const panel = document.createElement("div");
  panel.className = "macro-panel";

  const bodyHtml = (macroDescriptions[label] || "").trim();

  panel.innerHTML = `
    <button class="macro-close" aria-label="Close macro panel">×</button>
    <div class="macro-panel-body">
      ${bodyHtml}
    </div>
  `;

  const btn = panel.querySelector(".macro-close");
  if (btn) {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      panel.style.display = "none";
      if (openMacroLabel === label) {
        const node = macroLabelNodes.get(label);
        if (node) d3.select(node).text("▾ " + label);
        openMacroLabel = null;
      }
    });
  }

  document.body.appendChild(panel);


  macroPanels.set(label, panel);
  return panel;
}

function positionMacroPanel(label, svgNode) {
  const panel = macroPanels.get(label);
  if (!panel) return;

  const posPref = macroPosPref[label] || "bottom";

  // viewport rects
  const mapRect   = mount.getBoundingClientRect();
  const labelRect = svgNode.getBoundingClientRect();

  // ensure panel has measurable size (it is display:block before calling this)
  const panelRect = panel.getBoundingClientRect();

  // Compute left/top in *viewport* coords, then convert to *page* coords by adding scrollX/Y.
  let left = labelRect.left + (labelRect.width / 2) - (panelRect.width / 2);
  let top;

  if (posPref === "top") {
    top = labelRect.top - panelRect.height - 12;
    // keep it on-screen-ish (relative to map area)
    if (top < mapRect.top + 8) top = mapRect.top + 8;
  } else {
    top = labelRect.bottom + 12;
    const maxTopViewport = mapRect.bottom - panelRect.height - 8;
    if (top > maxTopViewport) top = maxTopViewport;
  }

  // Clamp horizontally within the map area (viewport coords)
  const minLeftViewport = mapRect.left + 9;
  const maxLeftViewport = mapRect.right - panelRect.width - 8;
  if (left < minLeftViewport) left = minLeftViewport;
  if (left > maxLeftViewport) left = maxLeftViewport;

  const macroOffsets = {
    "Western Georgia":      { dx: -10, dy: 440,  border: "#8ebeaeff" },
    "Eastern Georgia":      { dx: 0,   dy: 310, border: "#dfc6a0ff" },
    "Northwestern regions": { dx: 0,   dy: -450,  border: "#7f8dabff" },
    "Northeastern regions": { dx: 0,   dy: -450,  border: "#cda1bcff" }
  };

  const off = macroOffsets[label] || { dx: 0, dy: 0, border: null };


  if (off.border) {
    panel.style.border = `3px solid ${off.border}`;
    const closeBtn = panel.querySelector(".macro-close");
    if (closeBtn) {
      closeBtn.style.color = off.border;
      closeBtn.style.borderColor = off.border;
    }
  }

  const pad = 8; // small screen margin

left = Math.max(pad, Math.min(left, window.innerWidth  - panelRect.width  - pad));
top  = Math.max(pad, top);

left += off.dx;
top  += off.dy;

panel.style.left = `${left + window.scrollX}px`;
panel.style.top  = `${top  + window.scrollY}px`;



}

function smoothScrollTo(targetY, duration) {
  const startY = window.scrollY;
  const diff = targetY - startY;
  const startTime = performance.now();

  function step(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    window.scrollTo(0, startY + diff * eased);
    if (t < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

function scrollToPanel(panel, posPref = "bottom", duration = 600) {
  const rect = panel.getBoundingClientRect();
  const headerOffset = 80;
  let targetY;

  if (posPref === "top") {
    targetY = rect.top + window.scrollY - headerOffset;
  } else {
    const bottomOffset = 20;
    targetY = rect.bottom + window.scrollY - window.innerHeight + bottomOffset;
  }

  smoothScrollTo(targetY, duration);
}

function openMacroPanel(label, svgNode) {
  if (openMacroLabel && openMacroLabel !== label) {
    const prev = macroPanels.get(openMacroLabel);
    if (prev) prev.style.display = "none";
    const prevNode = macroLabelNodes.get(openMacroLabel);
    if (prevNode) d3.select(prevNode).text("▾ " + openMacroLabel);
  }

  const panel = createMacroPanel(label);
  panel.style.display = "block";
  positionMacroPanel(label, svgNode);
  
  const pad = 12;
const r = panel.getBoundingClientRect();
let delta = 0;

if (r.top < pad) delta = r.top - pad;
else if (r.bottom > window.innerHeight - pad) delta = r.bottom - (window.innerHeight - pad);

if (delta) smoothScrollTo(window.scrollY + delta, 500);

  openMacroLabel = label;

  const node = svgNode || macroLabelNodes.get(label);
  if (node) d3.select(node).text("▴ " + label);

  const posPref = macroPosPref[label] || "bottom";
//   const r = panel.getBoundingClientRect();
if (r.top < 12 || r.bottom > window.innerHeight - 12) scrollToPanel(panel, posPref, 900);


}

function toggleMacroPanel(label, svgNode) {
  const existing = macroPanels.get(label);
  if (existing && existing.style.display === "block") {
    existing.style.display = "none";
    const node = svgNode || macroLabelNodes.get(label);
    if (node) d3.select(node).text("▾ " + label);
    openMacroLabel = null;
    return;
  }
  openMacroPanel(label, svgNode);
}


      gMacros.selectAll("text.macro-label")
        .data(Object.keys(macroGroups))
        .enter()
        .append("text")
        .attr("class", "macro-label")
        .attr("x", d => macroLabelPos[d].x)
        .attr("y", d => macroLabelPos[d].y)
        .text(d => "▾ " + d)
        .attr("font-size", 22)
        .attr("font-weight", 700)
        .attr("text-anchor", "middle")
        .attr("fill", d => {
          if (d === "Eastern Georgia")      return "#cd9138";
          if (d === "Western Georgia")      return "#2e9a78";
          if (d === "Northwestern regions") return "#4562a6";
          if (d === "Northeastern regions") return "#c3679f";
          return "#525050ff";
        })
        .style("cursor", "pointer")
        .each(function(d){ macroLabelNodes.set(d, this); })
        .on("pointerenter", (event, label) => glowRegions(macroGroups[label]))
        .on("pointerleave", (event, label) => unglowRegions(macroGroups[label]))
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
          if (activePopover) { activePopover.remove(); activePopover = null; }
          if (activeItem) activeItem.classList.remove("is-active");

          const pop = document.createElement("div");
          pop.className = "region-popover";
          pop.innerHTML = popoverHTML(regionName);
          popCol.appendChild(pop);

          const itemRect = itemEl.getBoundingClientRect();
          const colRect  = popCol.getBoundingClientRect();
          pop.style.top = `${itemRect.top - colRect.top}px`;

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
    const nowPlayingPanel      = document.getElementById("now-playing-panel");
    const nowPlayingMore       = document.getElementById("now-playing-more");

    const descriptionEl        = document.getElementById("region-description");
    const closeBtn             = document.getElementById("close-player");
    const playBtn              = document.getElementById("audio-play");
    const seekEl               = document.getElementById("audio-seek");
    const timeEl               = document.getElementById("audio-time");
    const volumeEl             = document.getElementById("audio-volume");
    const muteBtn              = document.getElementById("audio-mute");

    // Now Playing accordion toggle (NO d used here)
    if (nowPlaying && nowPlayingPanel) {
      nowPlaying.style.cursor = "pointer";
      nowPlaying.addEventListener("click", () => {
        nowPlayingPanel.classList.toggle("is-open");

        const base = nowPlaying.dataset.base || nowPlaying.textContent.replace(/\.\.\.$/, "");
        nowPlaying.dataset.base = base;
        nowPlaying.textContent = nowPlayingPanel.classList.contains("is-open") ? base : (base + "...");
      });
    }

    const regionSuffix = {
      Svaneti: "Svanetian(<em>Svanuri</em>,<span class='ka'> სვანური</span>)",
      Samegrelo: "Mingrelian(<em>Megruli</em>,<span class='ka'> მეგრული</span>)",
      Guria: "Gurian(<em>Guruli</em>,<span class='ka'> გურული</span>)",
      Racha: "Rachian(<em>Rachuli</em>,<span class='ka'> რაჭული</span>)",
      Lechkhumi: "Lechkhumian(<em>Lechkhumuri</em>,<span class='ka'> ლეჩხუმური</span>)",
      Imereti: "Imeretian(<em>Imeruli</em>,<span class='ka'> იმერული</span>)",
      Kakheti: "Kakhetian(<em>Kakhuri</em>,<span class='ka'> კახური</span>)",
      Tusheti: "Tushetian(<em>Tushuri</em>,<span class='ka'> თუშური</span>)",
      Khevsureti: "Khevsurian(<em>Khevsuruli</em>,<span class='ka'> ხევსურული</span>)",
      Khevi: "Mokhevian(<em>Mokheuri</em>,<span class='ka'> მოხეური</span>)",
      Pshavi: "Pshavian(<em>Pshauri</em>,<span class='ka'> ფშაური</span>)",
      Achara: "Acharian(<em>Acharuli</em>,<span class='ka'> აჭარული</span>)",
      "Kvemo Kartli": "Kartlian(<em>Kartluri</em>,<span class='ka'> ქართლური</span>)",
      "Ertso-Tianeti": "Tianetian(<em>Tianuri</em>,<span class='ka'> თიანური</span>)",
      "Meskhet-Javakheti": "Meskhetian(<em>Meskhuri</em>,<span class='ka'> მესხური</span>)",
      "South Ossetia(Samachablo)": "Ossetian(<em>Iron </em>, <em>Ирон</em>, <span class='ka'> ოსური</span>)",
      Abkhazia: "Abkhazian(<em>Abkhazuri</em>,<span class='ka'> აფხაზური</span>)",
      Tbilisi: "Urban(<em>Kalakuri</em>,<span class='ka'> ქალაქური</span>)",
      Mtiuleti: "Mtiulian(<em>Mtiuluri</em>,<span class='ka'> მთიულური</span>)",
      "Shida Kartli": "Kartlian(<em>Kartluri</em>,<span class='ka'> ქართლური</span>)"
    };

    function fmtTime(sec) {
      if (!isFinite(sec) || sec < 0) sec = 0;
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return `${m}:${String(s).padStart(2, "0")}`;
    }

    function syncPlayIcon() {
      if (!playBtn || !audioElement) return;
      if (audioElement.paused) {
        playBtn.textContent = "▶";
        playBtn.setAttribute("aria-label", "Play");
      } else {
        playBtn.textContent = "⏸";
        playBtn.setAttribute("aria-label", "Pause");
      }
    }

    function syncSeekRange() {
      if (!seekEl || !audioElement) return;
      const dur = audioElement.duration;
      if (isFinite(dur) && dur > 0) {
        seekEl.max = String(dur);
        seekEl.value = String(audioElement.currentTime || 0);
      } else {
        seekEl.max = "0";
        seekEl.value = "0";
      }
    }

    function syncTimeLabel() {
      if (!timeEl || !audioElement) return;
      timeEl.textContent = fmtTime(audioElement.currentTime || 0);
    }

    function syncMuteUI() {
      if (!muteBtn || !audioElement) return;
      muteBtn.classList.toggle("is-muted", audioElement.muted);
      muteBtn.setAttribute("aria-label", audioElement.muted ? "Unmute" : "Mute");
    }

    function playRegionAudio(d) {
      if (!audioPlayerContainer || !audioElement || !nowPlaying) return;
      const src = d.properties && d.properties.audio;
      if (!src) return;

      audioElement.src = src;
      audioPlayerContainer.style.display = "block";
      audioElement.play().catch(() => {});

      const baseNow =
        `Now Playing: "${d.properties.title || ""}" by ${d.properties.artist || ""} (${d.properties.name || ""})`;
      nowPlaying.dataset.base = baseNow;
      nowPlaying.textContent = baseNow + "...";

      if (nowPlayingMore) {
        nowPlayingMore.innerHTML = `
          <p class="left-align" style="margin:0; text-align:justify;">        
            ${d.properties.about || ""}
          </p>
        `;
      }
//  <strong>Song:</strong> ${d.properties.title || ""}<br>
//             <strong>Artist:</strong> ${d.properties.artist || ""}<br>
//             <strong>Region:</strong> ${d.properties.name || ""}<br><br></br>


      if (nowPlayingPanel) nowPlayingPanel.classList.remove("is-open");

      // HEADER TEXT + COLOR
      const headerEl = document.getElementById("audio-accordion-header");
      if (headerEl) {
        const name   = d.properties.name;
        const suffix = regionSuffix[name] || name;
        headerEl.innerHTML = `${suffix} Tradition`;

        if (["Abkhazia","Samegrelo","Guria","Achara","Imereti"].includes(name)) {
          headerEl.style.color = "#66ab94ff";
        } else if (["Shida Kartli","Kvemo Kartli","Kakheti","Tbilisi","Meskhet-Javakheti","South Ossetia(SSamachablo)","South Ossetia(Samachablo)"].includes(name)) {
          headerEl.style.color = "#cfad78ff";
        } else if (["Svaneti","Racha","Lechkhumi"].includes(name)) {
          headerEl.style.color = "#65769aff";
        } else if (["Khevi","Khevsureti","Tusheti","Mtiuleti","Pshavi","Ertso-Tianeti"].includes(name)) {
          headerEl.style.color = "#bd7da5ff";
        } else {
          headerEl.style.color = "#202020";
        }
      }

      // DESCRIPTION TEXT
      if (descriptionEl) {
        const desc = regionDescriptions[d.properties.name];
        descriptionEl.innerHTML = desc || "No description available for this region yet.";
      }

      currentRegion = d.properties.name;

      // BORDER COLOR + PLAYER ACCENT
      const r = d.properties.name;
      let accent = "#5a7263";

      if (["Abkhazia","Samegrelo","Guria","Achara","Imereti"].includes(r)) {
        accent = "#66ab94ff";
      } else if (["Meskhet-Javakheti","Shida Kartli","Kvemo Kartli","Kakheti","Tbilisi","South Ossetia(Samachablo)"].includes(r)) {
        accent = "#cfad78ff";
      } else if (["Svaneti","Racha","Lechkhumi"].includes(r)) {
        accent = "#65769aff";
      } else if (["Khevi","Khevsureti","Tusheti","Mtiuleti","Pshavi","Ertso-Tianeti"].includes(r)) {
        accent = "#bd7da5ff";
      }

      audioPlayerContainer.style.border = `3px solid ${accent}`;
      audioPlayerContainer.style.setProperty("--player-accent", accent);

      syncPlayIcon();
      syncSeekRange();
      syncTimeLabel();
      syncMuteUI();
      if (volumeEl && audioElement) volumeEl.value = String(audioElement.volume ?? 1);
    }

    function closeAudioPlayer() {
      if (!audioPlayerContainer || !audioElement) return;
      audioElement.pause();
      audioElement.currentTime = 0;
      audioPlayerContainer.style.display = "none";
      syncPlayIcon();
      syncSeekRange();
      syncTimeLabel();
    }

    if (closeBtn) closeBtn.addEventListener("click", closeAudioPlayer);

    // --- wire up custom controls (once) ---------------------------------
    if (audioElement) {
      audioElement.addEventListener("play",  syncPlayIcon);
      audioElement.addEventListener("pause", syncPlayIcon);
      audioElement.addEventListener("ended", () => { syncPlayIcon(); syncSeekRange(); });

      audioElement.addEventListener("timeupdate", () => { syncSeekRange(); syncTimeLabel(); });
      audioElement.addEventListener("loadedmetadata", () => { syncSeekRange(); syncTimeLabel(); });

      audioElement.addEventListener("volumechange", syncMuteUI);
    }

    if (playBtn && audioElement) {
      playBtn.addEventListener("click", () => {
        if (audioElement.paused) audioElement.play().catch(() => {});
        else audioElement.pause();
      });
    }

    if (seekEl && audioElement) {
      seekEl.addEventListener("input", () => {
        const v = parseFloat(seekEl.value);
        if (isFinite(v)) {
          audioElement.currentTime = v;
          syncTimeLabel();
        }
      });
      seekEl.addEventListener("change", () => {
        const v = parseFloat(seekEl.value);
        if (isFinite(v)) audioElement.currentTime = v;
      });
    }

    if (volumeEl && audioElement) {
      volumeEl.addEventListener("input", () => {
        const v = parseFloat(volumeEl.value);
        if (isFinite(v)) audioElement.volume = Math.min(1, Math.max(0, v));
      });
    }

    if (muteBtn && audioElement) {
      muteBtn.addEventListener("click", () => {
        audioElement.muted = !audioElement.muted;
        syncMuteUI();
      });
      syncMuteUI();
    }

    syncPlayIcon();
    syncSeekRange();
    syncTimeLabel();
  };

  // ==================== ACCORDION HEADER ARROW SYNC =====================
  document.addEventListener("DOMContentLoaded", () => {
    const panels = document.querySelectorAll(".accordion-panel");

    panels.forEach(panel => {
      const header = panel.previousElementSibling;
      if (!header || !header.classList.contains("accordion-header")) return;

      if (panel.classList.contains("is-open")) {
        header.classList.add("is-open");
      }

      const observer = new MutationObserver(mutations => {
        mutations.forEach(m => {
          if (m.attributeName !== "class") return;
          if (panel.classList.contains("is-open")) header.classList.add("is-open");
          else header.classList.remove("is-open");
        });
      });

      observer.observe(panel, { attributes: true, attributeFilter: ["class"] });
    });
  });
})();
