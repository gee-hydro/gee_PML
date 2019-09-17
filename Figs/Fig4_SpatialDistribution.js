/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var pml_v1_yearly = ee.ImageCollection("projects/pml_evapotranspiration/PML/OUTPUT/PML_V1_yearly"),
    pml_v2_yearly_v011 = ee.ImageCollection("projects/pml_evapotranspiration/PML/OUTPUT/PML_V2_yearly"),
    img_lai = ee.Image("MODIS/006/MCD15A3H/2002_07_04"),
    pml_v1 = ee.ImageCollection("projects/pml_evapotranspiration/PML/OUTPUT/PML_V1_8day"),
    pml_v2 = ee.ImageCollection("projects/pml_evapotranspiration/PML/OUTPUT/PML_V2_8day"),
    pml_v2_yearly_v013 = ee.ImageCollection("projects/pml_evapotranspiration/PML/v012/PML_V2_yearly_v013"),
    pml_v2_yearly_v014 = ee.ImageCollection("projects/pml_evapotranspiration/PML/v012/PML_V2_yearly_v014");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
/** 
 * Spatial distribution and ET component percentage
 * Dongdong Kong
 */
var pkg_export = require('users/kongdd/public:pkg_export.js');
var pkg_vis   = require('users/kongdd/public:pkg_vis.js');

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
var pml_v2_yearly = ee.ImageCollection(pml_v2_yearly_v014.toList(20));

var annual1   = pml_v1_yearly.mean().select([0, 1, 2, 3]).toFloat();
var annual2   = pml_v2_yearly.mean().select([0, 1, 2, 3, 4]).toFloat();
print(annual1, annual2)

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
// print(annual);

var ET     = annual.expression('b("Ec") + b("Es")+ b("Ei")').rename('ET'); //, b("ET_water")
var per_Ei = annual.expression(' b("Ei") / ET * 100', {ET:ET}).rename('per');
var per_Es = annual.expression(' b("Es") / ET * 100', {ET:ET}).rename('per');
var per_Ec = annual.expression(' b("Ec") / ET * 100', {ET:ET}).rename('per');

if (V2) {
    var GPP = annual.select('GPP');
    var WUE = annual.expression('b("GPP") / ET', {ET:ET}).rename('WUE');
    // var WUE = annual.expression('b("GPP") / b("Ec")').rename('WUE');    
}

var p = require('users/kongdd/gee_PML:Figs/legend.js');

/** visualization parameters for EVI */
Map.addLayer(annual.select("GPP"), p.vis.gpp, 'annual average GPP');
Map.addLayer(ET                  , p.vis.et , 'annual average ET');
// Map.addLayer(ET_v1, vis_et , 'annual average ET PML_v1');
// pkg_vis.grad_legend(vis_et, 'ET', 'ET', true);
Map.addLayer(WUE   , p.vis.wue, 'annual average WUE');
// Map.addLayer(per_Ei   , vis_per, 'per_Ei');
// Map.addLayer(per_Es   , vis_per, 'per_Es');
Map.addLayer(per_Ec   , p.vis.perc, 'per_Ec');

pkg_vis.add_lgds([p.lg.gpp, p.lg.et, p.lg.wue, p.lg.perc]);

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


// export_image(annaul_raw, 'PMLv2_Annual_average_raw');
// export_image(annual, filename);
// export_image(annual1, 'PMLv1_Annual_average_240th');
// export_image(annual2, 'PMLv2_Annual_average_240th');

folder = '';
var cellsize = 1/12,
    type = 'drive';

// pkg_export.ExportImg(annual1, 'PMLv1_Annual_average_'.concat(1/scale), range, scale, drive, folder, 'EPSG:4326');
// pkg_export.ExportImg(annual2, 'PMLv2_Annual_average_'.concat(1/scale), range, scale, drive, folder, 'EPSG:4326');

// crs    = 'SR-ORG:6974';
// folder = 'projects/pml_evapotranspiration/PML/OUTPUT/MultiAnnualMean';
// scale = 1/12; drive = false;
// ExportImg(annual1, range, 'PMLv1_Annual_average_'.concat(1/scale), scale, drive, folder, crs);

pkg_export.ExportImg(annual2, 'PMLv2_Annual_average_v014_'.concat(1/cellsize), 
    range, cellsize, type, folder, crs);

// scale = 1/240; drive = false;
// ExportImg(annual1, range, 'PMLv1_Annual_average_'.concat(1/scale), scale, drive, folder, crs);
// ExportImg(annual2, range, 'PMLv2_Annual_average_'.concat(1/scale), scale, drive, folder, crs);
    
// export_image(annual_v1    , 'PMLv1_Annual_average');
// 2. try to Export video
WUE = WUE.visualize(p.vis.wue);

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
