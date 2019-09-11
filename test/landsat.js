/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var l7 = ee.ImageCollection("LANDSAT/LE07/C01/T1_ANNUAL_GREENEST_TOA"),
    l5 = ee.ImageCollection("LANDSAT/LT05/C01/T1_ANNUAL_GREENEST_TOA"),
    l4 = ee.ImageCollection("LANDSAT/LT04/C01/T1_ANNUAL_GREENEST_TOA"),
    l8 = ee.ImageCollection("LANDSAT/LC08/C01/T1_ANNUAL_GREENEST_TOA"),
    poly = ee.FeatureCollection("users/kongdd/beijiang");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var pkg_index   = require('users/kongdd/public:pkg_index.js');
var pkg_export = require('users/kongdd/public:pkg_export.js');

function clip_region(img){
    var vi = pkg_index.NDVI(img);
    vi = vi.clip(poly).copyProperties(img, ['system:time_start']);
    return vi;
}

/** Add cloud score to sentinel images */
var s_score = function(img) {
    var score = img.select(0).mask().multiply(0).rename('cloud');
    return img.addBands(score);
};

var bands = {
    S2: { from: ['B11', 'B8', 'B4', 'B3', 'B2'], to: ['swir', 'nir', 'red', 'green', 'blue'] },
    L8: { from: ['B6', 'B5', 'B4', 'B3', 'B2'], to: ['swir', 'nir', 'red', 'green', 'blue'] },
    L7: { from: ['B5', 'B4', 'B3', 'B2', 'B1'], to: ['swir', 'nir', 'red', 'green', 'blue'] },
    L5: { from: ['B5', 'B4', 'B3', 'B2', 'B1'], to: ['swir', 'nir', 'red', 'green', 'blue'] },
    L4: { from: ['B5', 'B4', 'B3', 'B2', 'B1'], to: ['swir', 'nir', 'red', 'green', 'blue'] },
};

// print(l4.limit(1));
var prj = pkg_export.getProj(l4);
print(prj);

l4 = l4.select(bands.L4.from, bands.L4.to)
    .map(clip_region);
l5 = l5.select(bands.L5.from, bands.L5.to)
    .map(clip_region);
l7 = l7.select(bands.L7.from, bands.L7.to)
    .map(clip_region);
l8 = l8.select(bands.L8.from, bands.L8.to)
    .map(clip_region);
    
print(l8);
/** 1 */
// var ls = require('users/gena/packages:assets');
// ls.getImages();
// print(l8.first());

var range     = [112,23, 115, 26],
    bounds    = ee.Geometry.Rectangle(range, 'EPSG:4326', false), //[xmin, ymin, xmax, ymax]
    cellsize  = 1 / 240, //1/240,
    type      = 'drive',
    folder    = "",
    crs       = 'EPSG:4326'; //projects/pml_evapotranspiration
    // crsTransform = prj.crsTransform;
  
// pkg_export.ExportImgCol()
Map.addLayer(l8);
pkg_export.ExportImgCol(l4, null, range, cellsize, type, folder, crs);
pkg_export.ExportImgCol(l5, null, range, cellsize, type, folder, crs);
pkg_export.ExportImgCol(l7, null, range, cellsize, type, folder, crs);
pkg_export.ExportImgCol(l8, null, range, cellsize, type, folder, crs);
