/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var pml_v1_yearly = ee.ImageCollection("projects/pml_evapotranspiration/PML/OUTPUT/PML_V1_yearly"),
    pml_v2_yearly = ee.ImageCollection("projects/pml_evapotranspiration/PML/OUTPUT/PML_V2_yearly"),
    img_lai = ee.Image("MODIS/006/MCD15A3H/2002_07_04"),
    pml_v1 = ee.ImageCollection("projects/pml_evapotranspiration/PML/OUTPUT/PML_V1_8day"),
    pml_v2 = ee.ImageCollection("projects/pml_evapotranspiration/PML/OUTPUT/PML_V2_8day");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
/** 
 * Spatial distribution and ET component percentage
 * Dongdong Kong
 */
var pkg_vis   = require('users/kongdd/public:pkg_vis.js');
var pkg_color = require('users/gena/packages:colorbrewer').Palettes;

var crs_trans = [463.3127165279165, 0, -20015109.353988  , 0, -463.3127165274999 , 10007554.676994   ]; //origin LAI
// print(pml_v2_yearly, img_lai);

/**
 * Update 17 Mar, 2018
 * 
 * 1. Fix export crsTransform.
 * 2. add map linker option
 */
 
/**
 * GLOBAL PARAMETERS
 */
var range  = [-180, -60, 180, 90];
var bounds = ee.Geometry.Rectangle(range, 'EPSG:4326', false);

var annual, bands, folder, filename;
var V2 = true;

pml_v1_yearly = ee.ImageCollection(pml_v1_yearly.toList(20));
pml_v2_yearly = ee.ImageCollection(pml_v2_yearly.toList(20));

var annual1   = pml_v1_yearly.mean().select([0, 1, 2, 3, 4]).toFloat();
var annual2   = pml_v2_yearly.mean().select([0, 1, 2, 3]).toFloat();
// print(annual1)

if (V2) {
    annual   = pml_v2_yearly.mean();
    bands    = ['GPP', 'Ec', 'Ei', 'Es']; //, 'ET_water'
    folder   = "PML_V2";
    filename = 'PMLv2_Annual_average_12th';
} else {
    annual   = pml_v1_yearly.mean();
    bands    = ['Ec', 'Ei', 'Es']; //, 'ET_water'
    folder   = "PML_V1";
    filename = 'PMLv1_Annual_average_12th';
}
annual = annual.select(bands);
print(annual);

var ET     = annual.expression('b("Ec") + b("Es")+ b("Ei")').rename('ET'); //, b("ET_water")
var per_Ei = annual.expression(' b("Ei") / ET * 100', {ET:ET}).rename('per');
var per_Es = annual.expression(' b("Es") / ET * 100', {ET:ET}).rename('per');
var per_Ec = annual.expression(' b("Ec") / ET * 100', {ET:ET}).rename('per');

if (V2) {
    var GPP = annual.select('GPP');
    var WUE = annual.expression('b("GPP") / ET', {ET:ET}).rename('WUE');
    // var WUE = annual.expression('b("GPP") / b("Ec")').rename('WUE');    
}

var vis_et  = {min: 100, max: 1600 , palette:pkg_color.RdYlBu[11]},
    vis_gpp = {min: 100, max: 3900 , palette:pkg_color.RdYlGn[11]};
    
/** visualization parameters for EVI */
var palette = ['#570088', '#920057', '#CE0027', '#FF0A00', '#FF4500', '#FF8000', '#FFB100', '#FFD200', '#FFF200', '#C7EE03', '#70D209', '#18B80E', '#067F54', '#033FA9', '#0000FF'];
var vis_wue = { min: 0.0, max: 4.0, palette: palette};
var vis_per = { min: 0.0, max: 20 , palette: palette, bands: 'per'};

var vis_per = { min: 0, max: 100 , palette: palette, bands: 'per'};

// Map.addLayer(annual, vis_gpp, 'annual average GPP');
// pkg_vis.grad_legend(vis_gpp, 'annual average GPP /n(gC m^-2 y^-1)', true);

// Map.addLayer(ET    , vis_et , 'annual average ET');
// pkg_vis.grad_legend(vis_et, 'ET', 'ET', true);

// Map.addLayer(ET_v1, vis_et , 'annual average ET PML_v1');
// pkg_vis.grad_legend(vis_et, 'ET', 'ET', true);

// Map.addLayer(WUE   , vis_wue, 'annual average WUE');
// grad_legend(vis_wue, 'annual average WUE', true);

Map.addLayer(per_Ei   , vis_per, 'per_Ei');
Map.addLayer(per_Es   , vis_per, 'per_Es');
Map.addLayer(per_Ec   , vis_per, 'per_Ec');
pkg_vis.grad_legend(vis_per, 'percentage', true);

// 1. try to Export to drive
var scale = 1/240,
    drive = true,
    crs = 'EPSG:4326'; //SR-ORG:6974, EPSG:4326
var sizeX  = (range[2] - range[0]) / scale;
var sizeY  = (range[3] - range[1]) / scale;
var dimensions = sizeX.toString() + 'x' + sizeY.toString();
// var crs_trans  = [scale, 0, -180, 0, -scale, 90];

function export_image(img, description){
    Export.image.toDrive({
          image: img,
          description: description,
          folder: folder,
          crs: crs,
          crsTransform: crs_trans,
          dimensions: dimensions,
          maxPixels: 1e13,
          skipEmptyTiles: true
      });  
}

function ExportImg_deg(Image, range, task, scale, drive, folder, crs, crs_trans){
  var bounds; // define export region
  
  if (typeof range  === 'undefined') { range  = [-180, -70, 180, 90];}
  if (typeof drive  === 'undefined') { drive  = false;}
  if (typeof folder === 'undefined') { folder = ''; }
  if (typeof crs    === 'undefined') { crs    = 'SR-ORG:6974';} //'EPSG:4326'
  if (typeof crs_trans === 'undefined'){
      bounds = ee.Geometry.Rectangle(range, 'EPSG:4326', false); //[xmin, ymin, xmax, ymax]
  }
 
  var step   = scale; // degrees
  var sizeX  = (range[2] - range[0]) / step;
  var sizeY  = (range[3] - range[1]) / step;
  var dimensions = sizeX.toString() + 'x' + sizeY.toString(); //[sizeX, ]
  
  // var crs_trans  = [scale, 0, -180, 0, -scale, 90];
  var params = {
      image        : Image,
      description  : task,
      crs          : crs,
      crsTransform : crs_trans,
      region       : bounds,
      dimensions   : dimensions,
      maxPixels    : 1e13
  };
         
  if (drive){
      params.folder         = folder;
      params.skipEmptyTiles = true;
      Export.image.toDrive(params);  
  }else{
      params.assetId = folder.concat('/').concat(task), //projects/pml_evapotranspiration/;
      Export.image.toAsset(params);  
  }
  print(params);
}

// export_image(annaul_raw, 'PMLv2_Annual_average_raw');
// export_image(annual, filename);
// export_image(annual1, 'PMLv1_Annual_average_240th');
// export_image(annual2, 'PMLv2_Annual_average_240th');

// var pkg_export = require('users/kongdd/public:pkg_export.js');
crs    = 'SR-ORG:6974';
folder = '';

scale = 1/12; drive = true;
ExportImg_deg(annual1, range, 'PMLv1_Annual_average_'.concat(1/scale), scale, drive, folder, 'EPSG:4326');
ExportImg_deg(annual2, range, 'PMLv2_Annual_average_'.concat(1/scale), scale, drive, folder, 'EPSG:4326');

folder = 'projects/pml_evapotranspiration/PML/OUTPUT/MultiAnnualMean';
// scale = 1/12; drive = false;
// ExportImg_deg(annual1, range, 'PMLv1_Annual_average_'.concat(1/scale), scale, drive, folder, crs);
// ExportImg_deg(annual2, range, 'PMLv2_Annual_average_'.concat(1/scale), scale, drive, folder, crs);

// scale = 1/240; drive = false;
// ExportImg_deg(annual1, range, 'PMLv1_Annual_average_'.concat(1/scale), scale, drive, folder, crs);
// ExportImg_deg(annual2, range, 'PMLv2_Annual_average_'.concat(1/scale), scale, drive, folder, crs);
    
// export_image(annual_v1    , 'PMLv1_Annual_average');
// 2. try to Export video
WUE = WUE.visualize(vis_wue);

var imgcol = ee.ImageCollection([ET, GPP, WUE]);
// print(imgcol);
// Export.video.toDrive({
//     collection: ee.ImageCollection(ET),
//     description: 'PML_V2_annual_video',
//     dimensions: dimensions,
//     framesPerSecond: 1,
//     crs: crs,
//     crsTransform: crs_trans,
// });

var mapNames = ['ET', 'GPP', 'WUE'];
var maps     = [];
mapNames.forEach(function(name, index) {
    var map = ui.Map(), lg;
    // map.setOptions('SATELLITE');
    // control visibility
    if (index === 0) {
        map.addLayer(ET, vis_et, 'annual average ET');
        lg = pkg_vis.grad_legend(vis_et, '(a) annual average ET', false);
        
        // map.setControlVisibility(false);
    } else if (index === 1) {
        map.addLayer(GPP, vis_gpp, 'annual average GPP');
        lg = pkg_vis.grad_legend(vis_gpp, '(b) annual average GPP', false);
        // map.addLayer(land, {}, 'landcover');
        map.setControlVisibility({
            mapTypeControl: false,
            zoomControl: false,
            fullscreenControl: false
        });
    } else if (index === 2) {
        map.addLayer(WUE, {}, 'annual average WUE');
        lg = pkg_vis.grad_legend(vis_wue, '(c) annual average WUE', false);
        map.setControlVisibility({
            mapTypeControl: false,
            zoomControl: false,
            fullscreenControl: false
        });
    }
    // map.add(ui.Label(name));
    map.add(lg);
    // map = basemap(map);
    maps.push(map);
});

var linker = ui.Map.Linker(maps);

var mainPanel = ui.Panel({
    widgets: [maps[0], maps[1]], //, maps[2]
    layout: ui.Panel.Layout.Flow('vertical'),
    style: { stretch: "both" }
});
// ui.root.clear();
// ui.root.add(mainPanel);
