/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var pmlv2 = ee.ImageCollection("projects/pml_evapotranspiration/PML/OUTPUT/TEMP/PML_V2_yearly"),
    pmlv1 = ee.ImageCollection("projects/pml_evapotranspiration/PML/OUTPUT/TEMP/PML_V1_yearly");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var pkg_export = require('users/kongdd/public:pkg_export.js');

var imgcol = pmlv2;
imgcol = ee.ImageCollection(imgcol.toList(20));

var range  = [-180, -60, 180, 90],
    scale  = 1 / 120, //1/240,
    drive  = true,
    folder = 'PMLV2yearly'; //

// Map.addLayer(bound, {}, 'bounds');
/** clip regional data */
// imgcol = imgcol.map(function(img){ return img.clip(region); });
// range = [137, -31, 147, -20];
range = [73, 25, 105, 40];
// print(region);
// print(imgcol.limit(10));
// Map.addLayer(region);

// var range  = [-180, -60, 180, 90];
var cellsize = 1 / 240, //1/240,
    type   = 'drive',
    folder = 'PMLV2TP', 
    crs    = 'EPSG:4326'; //

var date_begin = '2002-07-04', 
    date_end   = '2017-12-31';
    
imgcol = imgcol.filterDate(date_begin, date_end);

pkg_export.ExportImgCol(imgcol, undefined, range, cellsize, type, folder, crs);
