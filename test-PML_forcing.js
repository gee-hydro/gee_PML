var pkg_forcing = require('users/kongdd/gee_PML:pkg_PML_forcing.js');
var year = 2003;
var imgcol = pkg_forcing.PML_INPUTS_d8(year, 2017, {is_dynamic_lc: true});
// not that PML_INPUTS_d8 has the parameter `is_dynamic_lc`
// var INPUTS = pkg_forcing.PML_INPUTS_d8(year, 2005);
var bands = [0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12];

imgcol = imgcol.map(function(img) {
    return img.toFloat();
});
imgcol = imgcol.select(bands);
print(imgcol.limit(3));

{
    var pkg_export = require('users/kongdd/public:pkg_export.js');
    var img = imgcol.first().select(0);
    var prj = pkg_export.getProj(imgcol);
    // c(25, 40, 73, 105)
    // [70, 15, 140, 55]
    var options = {
        type: "drive",
        range: [73, 25, 105, 40], //[-180, -60, 180, 90],
        cellsize: 1 / 10,
        // crsTransform : [463.312716528, 0, -20015109.354, 0, -463.312716527, 10007554.677], // prj.crsTransform;
        // scale        : 463.3127165275, // prj.scale
        crs: 'EPSG:4326', // 'SR-ORG:6974', // EPSG:4326
        folder: 'PMLV2'
    };
    
    // 1. multiple bands img
    // var task = "MOD17A2H_GPP_010deg_TP_";
    
    var task = "PML_forcing_010deg_TP_";
    // var imgcol = require('users/kongdd/gee_PML:src/mosaic_LAI.js').smoothed;
    var img = imgcol.toBands();
    // pkg_export.ExportImg(img, task, options);
    
    // export bandnames
    var bandnames = img.bandNames();
    var f = ee.FeatureCollection(ee.Feature(null, {bandname: bandnames}));
    var task_bandname = task.concat('names');
    // Export.table.toDrive(f, task_bandname, 'PMLV2', task_bandname, "CSV");
}


// second solution 
// for (var year = 2003; year <= 2017; year ++) {
//     var filter = ee.Filter.calendarRange(year, year, 'year');
//     var imgcol_year = imgcol.filter(filter);
//     var img = imgcol_year.toBands();
    
//     var task = "PML_forcing_010deg_TP_" + year + "_";
//     pkg_export.ExportImg(img, task, options);
    
//     var bandnames = img.bandNames();
//     var f = ee.FeatureCollection(ee.Feature(null, {bandname: bandnames}));
//     var task_bandname = task.concat('names');
//     // Export.table.toDrive(f, task_bandname, 'PMLV2', task_bandname, "CSV");
// }
