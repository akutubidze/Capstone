const width = 900;
const height = 600;

const svg = d3.select("#map")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

//d3.json("").then(function(geoData) {
       // console.log(geoData);
        // Code to render the map goes here
    //})
    //.catch(function(error) {
       // console.error("Error loading GeoJSON:", error);
    //})

    // Set up a projection and path generator
//const projection = d3.geoMercator()
const projection = d3.geoMercator()
.center([43.4, 42]) // Center on Georgia (longitude, latitude)
.scale(7000) // Adjust scale for zoom
.translate([width / 2, height / 2]); // Center the map in the SVG

let path = d3.geoPath().projection(projection);

// Load GeoJSON datas
// d3.json("https://raw.githubusercontent.com/akutubidze/Capstone/refs/heads/main/Geo%20Data/geoBoundaries-GEO-ADM0_simplified.geojson?token=GHSAT0AAAAAAC2ZFS67UE5SDULL7YOEKIF4ZZ7QBHA")
d3.json('../Geo_Data/Regions.json')
.then(function(geoData) {
    svg.selectAll("path")
        .data(geoData.features)
        .enter()
        .append("path")
        .attr("d", path)
        .attr("fill", "#cccccc") // Default fill color
        .attr("stroke", "#000000") // Border color
        .attr("stroke-width", 0.5)
        .on("mouseover", function(event, d) {
            d3.select(this).attr("fill", "#ffcc00"); // Highlight on hover
        })
        .on("mouseout", function(event, d) {
            d3.select(this).attr("fill", "#cccccc"); // Reset fill on mouseout
        });

        const polygons = svg.selectAll('path');

  // Apply mousedown event for button press effect (indentation)
  polygons.on('mousedown', function(event, d) {
    d3.select(this)
      .transition()
      .duration(100)  // Short duration for the indent effect
      .attr('transform', 'scale(1, 1.1) translate(0, 5)')  // Simulate indent
      .style('fill', '#ffcc00');  // Optional: change fill color to indicate press
  });

  // Apply mouseup event for button release effect (reset)
  polygons.on('mouseup', function(event, d) {
    d3.select(this)
      .transition()
      .duration(100)  // Short duration to reset position
      .attr('transform', 'scale(1, 1) translate(0, 0)')  // Reset to original position
      .style('fill', function(d) {
        return colorScale(d.properties.value);  // Return to original color
      });
  });

  // Optional: Also handle mouseleave if you want to reset the polygon when the mouse leaves the element
  polygons.on('mouseleave', function(event, d) {
    d3.select(this)
      .transition()
      .duration(100)
      .attr('transform', 'scale(1, 1) translate(0, 0)')  // Reset to original position
      .style('fill', function(d) {
        return colorScale(d.properties.value);  // Return to original color
      });
  });

}).catch(function(error) {
    console.error("Error loading GeoJSON:", error);
});

// // Selecting POLYGONS


