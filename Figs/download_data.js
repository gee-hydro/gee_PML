/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var pmlv2 = ee.ImageCollection("projects/pml_evapotranspiration/PML/OUTPUT/TEMP/PML_V2_yearly");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var pkg_export = require('users/kongdd/public:pkg_export.js');

var imgcol = pmlv2;
imgcol = ee.ImageCollection(imgcol.toList(20));

var range  = [-180, -60, 180, 90],
    scale  = 1 / 120, //1/240,
    drive  = true,
    folder = 'PMLV2yearly'; //

pkg_export.ExportImgCol(pmlv2, undefined, range, scale, drive, folder);
