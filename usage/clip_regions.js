/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var region = ee.FeatureCollection("users/kongdd/shp/au_poly"),
    PML_V1 = ee.ImageCollection("projects/pml_evapotranspiration/PML/OUTPUT/PML_V1_8day");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
/**
 * Clip and download ImageCollection data in GEE
 * 
 * Dongdong Kong, Update 20181107
 */
var pkg_export = require('users/kongdd/public:pkg_export.js');

/** get bbox of assigned region */
function getRange(region){
    var bound = ee.Feature(region.first()).bounds();
    bound = bound.geometry().coordinates().get(0).getInfo();
    bound = ee.List(bound);
    
    var x = ee.Array(bound.get(0)).floor(),
        y = ee.Array(bound.get(2)).ceil();
        
    var range = ee.Array.cat([x, y], 0).getInfo();
    return range;
}

////////////////////////////////////////////////////////////////
/** 1. load imgcol*/
var imgcol = PML_V1;
imgcol     = ee.ImageCollection(imgcol.toList(1000)).select([0, 1, 2, 3, 4]);
var img_array = imgcol.toArray();
// print(imgcol.limit(3));

/** 2. Define the exporting region */
// Get the range from \code{region}, or define the range on your own.
var range = getRange(region);         // 1th solution
// var range = [73, 25, 105, 40];     // 2th solution, range = [lon_min, lat_min, lon_max, lat_max]
// var range  = [-180, -60, 180, 90]; // global

print(range); // check the defined range
// Map.addLayer(bound, {}, 'bounds');

/** clip regional data */
// imgcol = imgcol.map(function(img){ return img.clip(region); });
// print(imgcol.limit(10));
// Map.addLayer(region);

var cellsize = 1 / 20,    // The resolution you want to resample, in the unit of degree.
                          // The original resolution is 500m (1/240 deg).
    type   = 'drive',     // Three options: 'drive', 'asset', 'cloud'
    folder = 'PML',       // Download data to this directory.
    crs    = 'EPSG:4326'; // Projection you want to transform. The default is wgs84.
                          // The original is MODIS Sinusoidal projection.

var date_begin = '2002-07-04', // begin time
    date_end   = '2017-12-31'; // end time
    
imgcol = imgcol.filterDate(date_begin, date_end);

pkg_export.ExportImgCol(imgcol.limit(3), undefined, range, cellsize, type, folder, crs);
