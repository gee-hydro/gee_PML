/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var gldas = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/GLDAS_V21_8day_V2"),
    imgcol_gldas = ee.ImageCollection("projects/pml_evapotranspiration/ET_Complementary/GLDAS_v21_8day"),
    imgcol_emiss = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/Emiss_interp_8d"),
    albedo_daily = ee.ImageCollection("MODIS/006/MCD43A3"),
    emiss_org = ee.ImageCollection("MODIS/006/MOD11A2"),
    imgcol_albedo2 = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/Albedo_interp_8d_v2"),
    pml_v2 = ee.ImageCollection("projects/pml_evapotranspiration/PML/OUTPUT/PML_V2_8day"),
    pml_v1 = ee.ImageCollection("projects/pml_evapotranspiration/PML/OUTPUT/PML_V1_8day"),
    imgcol_watch = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/Forcing/WATCH_daily"),
    imgcol_pgf = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/Forcing/PGF_daily"),
    imgcol_spot = ee.ImageCollection("projects/pml_evapotranspiration/SPOT/SPOT_NDVIs10"),
    imageCollection = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/Albedo_interp_8d_linear"),
    PML_014 = ee.ImageCollection("projects/pml_evapotranspiration/PML/V2/8day");
/***** End of imports. If edited, may not auto-convert in the playground. *****/

function filter_col(imgcol, yearBegin, yearEnd){
    imgcol = imgcol.filter(ee.Filter.calendarRange(yearBegin, yearEnd, 'year'));
    imgcol = imgcol.map(function(img){
        var date = ee.Date(img.get('system:time_start'));
        return img.set('year', date.get('year'));
    }); //.aside(print);
    
    imgcol.aggregate_histogram('year').aside(print, 'year hists');
    var dates = ee.List(imgcol.aggregate_array('system:time_start')).map(function(x){
        return ee.Date(x).format('YYYY-MM-dd');
    }).aside(print, 'detail dates: ');
    // retrn 
}

var yearBegin = 2002,
    yearEnd   = 2019;
    
// filter_col(imgcol_v2, yearBegin, yearEnd);
// filter_col(imgcol_v1, yearBegin, yearEnd);

filter_col(imgcol_albedo2, yearBegin, yearEnd);
filter_col(imgcol_emiss, yearBegin, yearEnd);

filter_col(gldas, yearBegin, yearEnd);
filter_col(PML_014, 2018, yearEnd);

// filter_col(imgcol_watch, yearBegin, yearEnd);
// filter_col(PML_014, yearBegin, yearEnd);
var imgcol = PML_014;

var img = imgcol.first();

var date = imgcol.aggregate_array('system:index');
var size = imgcol.aggregate_array('system:asset_size');

// var dict = ee.Dictionary.fromLists(date, size);
// print(dict);


// print(imgcol_emiss);


// filter_col(gldas, 2018, 2018);
// 2011-05-17, 2011-03-06

// imgcol_emiss = imgcol_emiss.map(function(img){
//     return img.expression('b() * 0.002 + 0.49');
// });

// )
// Map.addLayer(ee.Image(imgcol_albedo.toList(10, 0).get(0)), {}, 'test img');

// Map.addLayer(imgcol_albedo, {}, 'imgcol_albedo');
// Map.addLayer(albedo_daily.select('Albedo_WSA_shortwave').limit(1000), {}, 'albedo_daily');

/** replace missing image */
function fix_img(){
    var img = ee.Image(imgcol_emiss.filterDate('2017-10-16', '2017-10-24').first());
    var date = ee.Date(img.get('system:time_start')).advance(8, 'day');
    img = img
        .set('system:time_start', date.millis())
        .set('d8', '38')
        .set('system:index', '2017-10-24');
        
    print(img);

    var pkg_export = require('users/kongdd/public:pkg_export.js');
    var range      = [-180, -60, 180, 90], // keep consistent with modis data range
        range_high = [-180, 60, 180, 90], //
        scale = 1 / 120,
        drive = false,
        crs = 'SR-ORG:6974';
    var task = '2017-10-24';
    var folder = 'projects/pml_evapotranspiration/PML_INPUTS/MODIS/Emiss_interp_8d'; 
       
    pkg_export.ExportImg_deg(img, range, task, scale, drive, folder, crs);
} 
// fix_img();
