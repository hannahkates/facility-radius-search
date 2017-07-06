// Instantiating the map object and setting the height based on window height
var h = window.innerHeight - 185;
$('#mapContainer').css('height',h);
$('#sidebar').css('height',h);
var map = L.map('mapContainer').setView([40.735021, -73.994787], 11);

// Adding a light basemap from carto's free basemaps
L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attribution">CARTO</a>'
}).addTo(map);

// Defining color for each Facility Domain
function getColor(facdomain) {
  return facdomain == 'Education, Child Welfare, and Youth' ? '#f7ca00' :
  facdomain == 'Health and Human Services' ? '#BA68C8' :
  facdomain == 'Libraries and Cultural Programs' ? '#73E5F4' :
  facdomain == 'Parks, Gardens, and Historical Sites' ? '#4CAF50' :
  facdomain == 'Public Safety, Emergency Services, and Administration of Justice' ? '#2979FF' :
  facdomain == 'Core Infrastructure and Transportation' ? '#8D8EAA' :
  facdomain == 'Administration of Government' ? '#CBCBD6' : '#FFF'
};

var siteLat;
var siteLong;
var valid;

// Filtering conditions
var radius = 1000;
var criteria = "facgroup = 'Schools (K-12)' OR facgroup = 'Child Care and Pre-Kindergarten' OR facgroup = 'Libraries'"

// Getting form input values
$('#submit-button').on('click', function(event) {
  $('.table-body').empty();
  var inputAddress = $('#addressnum').val();
  valid = true;
  event.preventDefault();
  if (valid == true) {
    var geoURL = 'https://maps.googleapis.com/maps/api/geocode/json?address=' + inputAddress + ' New York City';
    var geoOutput = $.getJSON(geoURL, function(data) {      
      siteLat = data.results["0"].geometry.location.lat;
      siteLong = data.results["0"].geometry.location.lng;
      createLayers(siteLat, siteLong);
    });
  };
});

// Function that creates all map layers and populate the facility list table
var createLayers = function(siteLat, siteLong) {

  // Creating and adding the SITE to the map
  var siteURL = 'https://cartoprod.capitalplanning.nyc/user/cpp/api/v2/sql?q=SELECT ST_Transform(ST_SetSRID(ST_MakePoint(' + siteLong + ',' + siteLat + '),4326), 3857) AS the_geom_webmercator, ST_SetSRID(ST_MakePoint(' + siteLong + ',' + siteLat + '),4326) AS the_geom, 1 AS cartodb_id, \'Proposed Site\' AS label&format=geojson&filename=download';
  $.getJSON(siteURL, function(sitePoint) {
    L.geoJson(sitePoint, {
      pointToLayer: function (feature, latlng) {
          var geojsonMarkerOptions = {
              radius: 8,
              fillColor: "black",
              color: "#000",
              weight: 1,
              opacity: 1,
              fillOpacity: 0.9
          };
          return L.circleMarker(latlng, geojsonMarkerOptions);
      }
    }).addTo(map);
  });

  // Creating and adding the BUFFER polygons to the map
  var bufferURL = 'https://cartoprod.capitalplanning.nyc/user/cpp/api/v2/sql?q=WITH site AS (SELECT ST_Transform(ST_SetSRID(ST_MakePoint(' + siteLong + ', ' + siteLat + '),4326), 3857) AS the_geom_webmercator) SELECT ST_Buffer( site.the_geom_webmercator, 121.92) AS the_geom_webmercator, ST_Transform(ST_Buffer( site.the_geom_webmercator, 121.92), 4326) AS the_geom FROM site UNION SELECT ST_Buffer(site.the_geom_webmercator,  ' + radius + ') AS the_geom_webmercator, ST_Transform(ST_Buffer( site.the_geom_webmercator,  ' + radius + '), 4326) AS the_geom FROM site&format=geojson&filename=download';
  var bufferPoly;
  $.getJSON(bufferURL, function(bufferPoly) {
   bufferPoly = L.geoJson(bufferPoly, {
      style: {
        color: "#000",
        weight: 2,
        opacity: 0.8,
        fillOpacity: 0
      }
    }).addTo(map);
    map.fitBounds(bufferPoly.getBounds());
  });

  // Getting and adding the filtered FACILITIES to the map
  var facQuery = 'WITH site AS (SELECT ST_Transform(ST_SetSRID(ST_MakePoint(' + siteLong + ', ' + siteLat + '),4326), 3857) AS the_geom_webmercator), buffer AS ( SELECT ST_Buffer(the_geom_webmercator,  ' + radius + ') AS the_geom_webmercator, ST_Transform(ST_Buffer(the_geom_webmercator,  ' + radius + '), 4326) AS the_geom FROM site) SELECT row_number() over (ORDER BY ST_Distance(f.the_geom_webmercator, site.the_geom_webmercator)) AS label, f.* FROM facdb_facilities AS f, site, buffer WHERE (' + criteria + ') AND ST_Intersects(f.the_geom_webmercator, buffer.the_geom_webmercator) ORDER BY label ASC'
  var facURL = 'https://cartoprod.capitalplanning.nyc/user/cpp/api/v2/sql?q=' + facQuery + '&format=geojson&filename=download';
  var facPoints;
  $.getJSON(facURL, function(facPoints) {
    // Populate table with facility list
    for (var i=0; i<facPoints.features.length; i++) {
      var myRow = '<tr>'
        + '<td width="5%">' + facPoints.features[i].properties.label + '</td>'
        + '<td width="30%">' + facPoints.features[i].properties.facname + '</td>'
        + '<td width="25%">' + facPoints.features[i].properties.facsubgrp + '</td>'
        + '<td width="25%">' + facPoints.features[i].properties.address + '</td>'
        + '<td width="15%"><a href=\'https://capitalplanning.nyc/facility/' + facPoints.features[i].properties.uid + '\' target=\'_blank\'>More details</a></td>'
      + '</tr>';
      $('.table-body').append(myRow);
    };
    facsubset = L.geoJson(facPoints, {
      // Display points
      pointToLayer: function (feature, latlng) {
        var d = feature.properties; 
        var geojsonMarkerOptions = {
            radius: 5,
            fillColor: getColor(d.facdomain),
            color: "#000",
            weight: 1,
            opacity: 1,
            fillOpacity: 0.9
        };
        var label = d.label;
        return L.circleMarker(latlng, geojsonMarkerOptions)
      },
      // Create label and popup content
      onEachFeature: function(feature, layer) {
        var d = feature.properties;   
        var label = d.label + '';
        layer.bindTooltip(label, {permanent: true});
      },
      onEachFeature: function(feature, layer) {
        var d = feature.properties;   
        var popupText = 'Label: ' + d.label + '<br />'
          + 'Name: <b>' + d.facname + '</b><br />' 
          + 'Category: ' + d.facsubgrp + '<br />' 
          + 'Address: ' + d.address;
        layer.bindPopup(popupText);
      }
    }).addTo(map);
  });
  
  // Creating csv download URL
  var facDownload = '<a target="_blank" href=\"https://cartoprod.capitalplanning.nyc/user/cpp/api/v2/sql?q=' + facQuery + '&format=csv&filename=FairShareList\"><span id="download-icon" class="glyphicon glyphicon-download-alt"></span></a>';
  button = '<button id="btn-download" type="button" class="btn btn-default">' + facDownload + '</button>';
  $('#table-header').append(button);
}

