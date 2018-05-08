/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var imgcol = ee.ImageCollection("projects/pml_evapotranspiration/PML/OUTPUT/PML_V2_8day");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var pkg_export = require('users/kongdd/public:pkg_export.js');

var points = require('users/kongdd/public:data/flux_points.js').points;
// points = points.filter(ee.Filter.inList('site', ['AU-Tum', 'AU-How', 'US-Ne1', 'US-Whs']));

// print(points)
// parameters for pkg_export
var dist    = 0,    // The radius of buffer, unit: meter
    reducer = 'mean', // Only if dist = 0, reducer will be used, otherwise, will be overwritten. 
                      // If dist > 0 and list=true , reducer=ee.Reducer.toList(); 
                      // If dist > 0 and list=false, reducer=ee.Reducer.toCollection(ee.Image(ImgCol.first()).bandNames())
    scale  = 500,      // reduceRegions scale
    list   = true,   // If list = true, list object return, otherwise data.frame
    save   = true,   // If save = true, will save to google drive
    file   = 'PMLv2-flux212',
    folder = "";

imgcol = ee.ImageCollection(imgcol.toList(1000));  
imgcol = imgcol.select([0, 1, 2, 3]);//.limit(10);

// var point = /* color: #d63000 */ee.Geometry.Point([-147.855917, 64.866111]);
// var features = ee.FeatureCollection(ee.Feature(point));

// print(imgcol);
// Map.addLayer(imgcol);
pkg_export.clipImgCol(imgcol, points, dist, reducer, scale, list, save, file, folder, 'CSV');
