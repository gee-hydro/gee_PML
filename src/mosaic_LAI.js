/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var imgcol_LAI_2018 = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/LAI_whit2018"),
    imgcol_lai_4d = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/LAI_whit_4d");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
// var imgcol_lai = require('users/kongdd/gee_PML:src/mosaic_LAI.js').smoothed;

// var pkg_main = require('users/kongdd/public:pkg_main.js');
var pkgs = require('users/kongdd/public:pkgs');

// 2000-2018
var LAI_4d = ee.ImageCollection(imgcol_lai_4d.toList(7).map(function (img) {
  return pkgs.bands2imgcol(img, 'LAI');
}).flatten());

LAI_d4 = LAI_d4.map(pkgs.add_dn(true, 8));
var LAI_d8 = pkg_trend.aggregate_prop(LAI_d4, 'dn', 'mean').select([0], ['LAI']);

print(LAI_d8);
