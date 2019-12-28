/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var imgcol_land = ee.ImageCollection("MODIS/006/MCD12Q1");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
/**
 * Dongdong Kong, 20191227
 * 
 * Aggregate into yearly
 */
var pkg_export = require('users/kongdd/public:pkg_export2.js');
var imgcol_PMLV2_v015_8d = ee.ImageCollection('projects/pml_evapotranspiration/PML/V2/8day');


var imgcol_years = aggregateToYearly(imgcol_PMLV2_v015_8d, 2003, 2018, 0.01, true);

var exec = true;

var prj = pkg_export.getProj(imgcol_land);
var options = {
    range        : [-180, -60, 180, 90],
    cellsize     : 1 / 240, //1/240,
    type         : 'asset',
    crs          : 'SR-ORG:6974', //projects/pml_evapotranspiration
    folder       : 'projects/pml_evapotranspiration/PML/V2/yearly',
    crsTransform : prj.crsTransform
};
// Map.addLayer(imgcol_years, {}, 'yearly');
pkg_export.ExportImgCol(imgcol_years, null, options);


/** MAIN FUNCTIONS ---------------------------------------------------------- */
function aggregateToYearly(imgcol, year_begin, year_end, scale_factor, verbose) {
    scale_factor = scale_factor || 0.01;
    if (verbose === undefined) verbose = false;
    
    var bands = ['GPP', 'Ec', 'Es', 'Ei', 'ET_water', 'qc']; //,'qc'
    var years = ee.List.sequence(year_begin, year_end);

    var imgcol_years = years.map(function(year) {
        var date_begin = ee.Date.fromYMD(year,1,1);
        var date_end   = ee.Date.fromYMD(year,12,31);

        var ydays = date_begin.advance(1, 'year').difference(date_begin, 'day');
        var imgcol_year = imgcol.filterDate(date_begin, date_end);
        var scale = ydays.multiply(scale_factor);
        
        return imgcol_year.select(bands.slice(0, -1))
            // .multiply(scale_factor).
            .mean()
            .multiply(scale)
            .toFloat()
            .set('system:time_start', date_begin.millis())
            .set('system:id', date_begin.format());
    });
    
    imgcol_years = ee.ImageCollection(imgcol_years);
    if (verbose) print("imgcol_years", imgcol_years);

    // pkg_export.ExportImg(img_year, task, range, cellsize, type, folder_yearly, crs, crsTransform);
    return imgcol_years;
}
