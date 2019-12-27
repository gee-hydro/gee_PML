/**
 * Dongdong Kong, 20191227
 * 
 * Aggregate into yearly
 */
var imgcol_PMLV2_v015_8d = ee.ImageCollection('projects/pml_evapotranspiration/PML/V2/8day')


var imgcol_years = aggregateToYearly(imgcol_PMLV2_v015_8d, 2003, 2018, true);

var exec = true;
var range     = [-180, -60, 180, 90],
    bounds    = ee.Geometry.Rectangle(range, 'EPSG:4326', false), //[xmin, ymin, xmax, ymax]
    cellsize  = 1 / 240, //1/240,
    type      = 'asset',
    crs       = 'SR-ORG:6974', //projects/pml_evapotranspiration
    folder    = 'projects/pml_evapotranspiration/PML/V2/yearly',
    crsTransform = prj.crsTransform;

pkg_export.ExportImgCol(imgcol_years, null, range, cellsize, type, folder, crs, crsTransform);


/** MAIN FUNCTIONS ---------------------------------------------------------- */
function aggregateToYearly(imgcol, year_begin, year_end, scale_factor, verbose) {
    scale_factor = scale_factor || 0.01;
    if (verbose === undefined) verbose = false;

    var years = ee.List.sequence(year_begin, year_end);

    var imgcol_years = years.map(function(year) {
        var date_begin = ee.Date.fromYMD(year,1,1);
        var date_end   = ee.Date.fromYMD(year,12,31);

        var ydays = date_begin.advance(1, 'year').difference(date_begin, 'day');
        var imgcol_year = imgcol.filterDate(date_begin, date_end);

        imgcol_PML.select(bands.slice(0, -1))
            .multiply(scale_factor).mean()
            .multiply(ydays)
            .toFloat()
            .set('system:time_start', begin_date.millis())
            .set('system:id', begin_date.format());
    })

    if (verbose) print("imgcol_years", imgcol_years)

    // pkg_export.ExportImg(img_year, task, range, cellsize, type, folder_yearly, crs, crsTransform);
    return imgcol_years;
}
