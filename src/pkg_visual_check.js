/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var MOD13Q1 = ee.ImageCollection("MODIS/006/MOD13Q1"),
    MOD13A1 = ee.ImageCollection("MODIS/MOD13A1"),
    NDVI_v4 = ee.ImageCollection("NOAA/CDR/AVHRR/NDVI/V4"),
    MCD15A3H = ee.ImageCollection("MODIS/006/MCD15A3H"),
    MOD11A2 = ee.ImageCollection("MODIS/006/MOD11A2"),
    MOD09GA_006 = ee.ImageCollection("MODIS/MOD09GA_006_NDVI"),
    points = ee.FeatureCollection("users/kongdd/shp/flux-212"),
    MOD17A2H = ee.ImageCollection("MODIS/006/MOD17A2H"),
    MOD16A2 = ee.ImageCollection("MODIS/NTSG/MOD16A2/105"),
    NLCD = ee.ImageCollection("USGS/NLCD"),
    MCD12Q1_005 = ee.ImageCollection("MODIS/051/MCD12Q1"),
    MCD12Q1_006 = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/MCD12Q1_006");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
/**
 * Visualization to check fluxsits' landcover
 * 
 * Updated 10 Jan, 2018
 * Dongdong Kong, Sun Yat-sen Univ
 */ 
var pkg_vis    = require('users/kongdd/public:pkg_vis.js');
var points     = require('users/kongdd/public:data/flux_points.js').points;
var points_buf = points.map(function(f) { return f.buffer(500);});

MCD12Q1_005 = MCD12Q1_005.select(['Land_Cover_Type_1']); //IGBP type
var lc_colors_005 = ["#aec3d6", "#162103", "#235123", "#399b38", "#38eb38", "#39723b", 
    "#6a2424", "#c3a55f", "#b76124", "#d99125", "#92af1f", "#10104c", 
    "#cdb400", "#cc0202", "#332808", "#d7cdcc", "#f7e174", "#743411"];
var lc_names_005 = ['WATER', 'ENF', 'EBF', 'DNF', 'DBF', 'MF', 
    'CSH', 'OSH', 'WSA', 'SAV', 'GRA', 'WET', 
    'CRO', 'URB', 'CNV', 'SNOW', 'BSV', 'UNC'];

var lc_colors_006 = ["#743411", "#162103", "#235123", "#399b38", "#38eb38", "#39723b", 
    "#6a2424", "#c3a55f", "#b76124", "#d99125", "#92af1f", "#10104c", 
    "#cdb400", "#cc0202", "#332808", "#d7cdcc", "#f7e174", "#aec3d6"];
var lc_names_006 = ['UNC', 'ENF', 'EBF', 'DNF', 'DBF', 'MF', 
    'CSH', 'OSH', 'WSA', 'SAV', 'GRA', 'WET', 
    'CRO', 'URB', 'CNV', 'SNOW', 'BSV', 'WATER'];

/** visualization parameters for EVI */
var palette = ['#570088', '#920057', '#CE0027', '#FF0A00', '#FF4500', '#FF8000', '#FFB100', '#FFD200', '#FFF200', '#C7EE03', '#70D209', '#18B80E', '#067F54', '#033FA9', '#0000FF'];
var visParams = { min: 0.0, max: 10000.0, palette: palette.reverse(), bands: 'EVI'};
// visParams = ee.Dictionary(visParams).remove(['bands']);

var lg = ui.Panel({ 
  layout: ui.Panel.Layout.Flow('horizontal'),
  style: { 
      position: 'bottom-left', 
      padding: '8px 15px' 
  } });

var lg1 = pkg_vis.grad_legend(visParams, 'VI', false);
var lg2 = pkg_vis.discrete_legend(lc_names_005, lc_colors_005, 'MCD12Q1_005', false);
var lg3 = pkg_vis.discrete_legend(lc_names_006, lc_colors_006, 'MCD12Q1_006', false);

// print(lg3, 'hello');
// function showLegend(){
//   lg.clear();
//   lg.add(lg2).add(lg1);
//   // lg1.add(lg2);
//   Map.add(lg);
// }
// showLegend();
// Map.addLayer(land, {}, 'landcover');
// Map.addLayer(MOD13Q1.select(['NDVI', 'EVI']), visParams, 'MOD13Q1');
// Map.addLayer(MOD13A1.select(['NDVI', 'EVI']), visParams, 'MOD13A1');
// Map.addLayer(points, {color:"red"}, 'points');
function basemap(map){
    map.addLayer(points, {color:"red"}, 'points');
    map.addLayer(points_buf, {}, 'points_buf');
    return map;
}

var filterDate = ee.Filter.date("2005-01-01", "2012-12-31");
function showmap(){
    ui.root.clear();
    var maps = [];
    var mapNames = ["satellite", "MCD12Q1_005", "MOD13A1", "MCD12Q1_006"]; //MOD13A1
    mapNames.forEach(function(name, index) {
        var map = ui.Map(), img;
        map.setOptions('SATELLITE');
        // control visibility
        if (index === 0) {
            var label = ui.Label(name);
            map.add(label);
            // map.setControlVisibility(false);
        } else if (index === 1) {
            // map.addLayer(land, {}, 'landcover');
            map.addLayer(MCD12Q1_006, {min: 0, max: 17, palette:lc_colors_006}, 'MCD12Q1_006');
            map.addLayer(MCD12Q1_005, {min: 0, max: 17, palette:lc_colors_005}, 'MCD12Q1_005');
            map.add(lg2);
            map.add(ui.Label(name));
            map.setControlVisibility({
                mapTypeControl: false,
                zoomControl: false,
                fullscreenControl: false
            });
        } else if (index === 2) {
            img = MOD13A1.select(['NDVI', 'EVI']).filter(filterDate);
            map.addLayer(MCD12Q1_006, {min: 0, max: 17, palette:lc_colors_006}, 'MCD12Q1_006');
            
            map.addLayer(img, visParams, name);
            map.add(ui.Label(name));
            
            map.add(lg1);
            map.setControlVisibility({
                mapTypeControl: false,
                zoomControl: false,
                fullscreenControl: false
            });
        } else {
            // img = MOD13A1.select(['NDVI', 'EVI']).filter(filterDate);
            map.addLayer(MCD12Q1_006, {min: 0, max: 17, palette:lc_colors_006}, name);
            map.add(ui.Label(name));
            map.add(lg3);
            map.setControlVisibility({
                mapTypeControl: false,
                zoomControl: false,
                fullscreenControl: false
            });
        }
        map = basemap(map);
        maps.push(map);
    });

    var linker = ui.Map.Linker(maps);

    var leftPanel  = ui.Panel([maps[0], maps[1]], null, { stretch: 'both' });
    var rightPanel = ui.Panel([maps[2], maps[3]], null, { stretch: 'both' });
    var mainPanel  = ui.Panel({
        layout: ui.Panel.Layout.Flow('horizontal'),
        style: {stretch: "both"}
    });
    mainPanel.style().set("stretch", "both");
    // mainPanel.setLayout(ui.Panel.Layout.Flow('horizontal'));
    mainPanel.add(leftPanel);
    mainPanel.add(rightPanel);
    // Map.add(mainPanel);
    // ui.root.clear();
    ui.root.add(mainPanel);
    return maps;
}

var maps = showmap();
maps[0].add(zoomToPoint(points, 'site', 14, false));
maps[0].setCenter(82.88, 24.37, 5);
/** max value */
// var label_max  = ui.Label('max value: ');
// var slider_max = ui.Slider({
//   min: 1000, max: 10000, value: visParams.max,
//   step: 500,
//   onChange: function(value){
//       visParams.max = value;
//       maps = showmaps();
//   },
//   style: {stretch: 'horizontal'}
// });
// var panel_max = ui.Panel({
//   widgets: [label_max, slider_max],
//   layout: ui.Panel.Layout.flow('horizontal'),
//   style: { position: 'bottom-left', padding: '3px' }
// });

/** max value */
// var label_min  = ui.Label('min value: ');
// var slider_min = ui.Slider({
//   min : 0, max: 10000,value: visParams.min,
//   step: 500,
//   onChange: function(value){
//       visParams.min = value;
//       maps = showmaps();
//   },
//   style: {stretch: 'horizontal'}
// });
// var panel_min = ui.Panel({
//   widgets: [label_min, slider_min],
//   layout: ui.Panel.Layout.flow('horizontal'),
//   style: { position: 'top-left', padding: '3px' }
// });
// maps[2].add(panel_max);
// maps[2].add(panel_min);
// zoomToPoint(points, 'site', 14);

function zoomToPoint(FeaCol, name, zoomlevel, IsPrint) {
    if (typeof zoomlevel === 'undefined') zoomlevel = 14;
    if (typeof IsPrint === 'undefined') IsPrint = true;

    FeaCol = FeaCol.sort(name);
    var names = FeaCol.aggregate_array(name).getInfo();

    // Get 1 row of the table and center the map on it.
    var centerObject = function(value) {
        // var row = ee.Number.parse(value);
        // Map.centerObject( ee.Feature(stations.toList(1, row).get(0)).geometry());
        var point = ee.Feature(FeaCol.filterMetadata(name, 'equals', value).first()); //ee.Filter.eq('site', value)
        maps[0].centerObject(point.geometry(), zoomlevel);
    };

    var size = FeaCol.size(); // How many objects?
    var tool = ui.Select({ items: names, onChange: centerObject });
    // tool.setValue(names[0]);
    if (IsPrint) {
        print(tool);
    } else {
        return tool;
    }
}