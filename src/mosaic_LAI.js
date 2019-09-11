/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var imgcol_LAI_2018 = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/LAI_whit2018"),
    imgcol_lai_4d = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/LAI_whit_4d");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
// var imgcol_lai = require('users/kongdd/gee_PML:src/mosaic_LAI.js').imgcol_LAI;

var pkg_main = require('users/kongdd/public:pkg_main.js');

// MOSAIC smoothed LAI images
// print(imgcol_lai_4d);

var patterns    = patterns || ["2018", "2019"];
var bandname_sm = 'smoothed';

var imgcol_2018 = [];
for (var i = 0; i < patterns.length; i++) {
    var img = imgcol_LAI_2018.filterMetadata("system:index", "starts_with", patterns[i]);
    var task = "whit" + patterns[i]; // + "_0_4";
    // if (IsPrint) print(task, img.size());
    
    img = img.mosaic();
    // img = img.reproject(crs, crs_trans); //, scale
    // img = img.reproject(prj_org);
  
    // if (IsExport) pkg_export.ExportImg_deg(img, task, range, 1/240, 'asset', folder, crs); //, crs_trans

    imgcol_2018[i] = pkg_main.bandsToImgCol(img, bandname_sm);
}

var imgcol_LAI = ee.ImageCollection( imgcol_lai_4d.toList(10).map(function(img){
        return pkg_main.bandsToImgCol(img, 'LAI');
    }).flatten())
// print(imgcol_LAI);
// .map(function(img){ return img.multiply(0.1).copyProperties(img, img.propertyNames());}); 
        
// imgcol_2018 = ee.ImageCollection(ee.List(imgcol_2018).flatten());
// imgcol_LAI  = imgcol_LAI.merge(imgcol_2018);
// print(imgcol_2018);
// print(imgcol_LAI);

// Map.addLayer(imgcol_2018);

exports.smoothed = imgcol_LAI;
// Map.addLayer(exports.smoothed);
