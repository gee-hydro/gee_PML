/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var imgcol_albedo = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/Albedo_interp_8d_linear");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
/** Albedo second interpolation: Monthly and Yearly History Average */
var pkg_join   = require('users/kongdd/public:pkg_join.js');
var pkg_trend  = require('users/kongdd/public:Math/pkg_trend.js');
var pkg_smooth = require('users/kongdd/public:Math/pkg_smooth.js');
var pkg_main   = require('users/kongdd/public:pkg_main.js');
var pkg_export = require('users/kongdd/public:pkg_export.js');

var prop_d8 = ['system:time_start', 'system:id', 'd8']; // 8 days ImgCol essential properties
var filter_date  = ee.Filter.date('2012-01-01', '2017-12-31');

imgcol_albedo = ee.ImageCollection(imgcol_albedo.toList(1000))
    .map(addProp);

var imgcol_all = imgcol_albedo, 
    imgcol     = imgcol_albedo.filter(filter_date);
    
var imgcol_his = his_interp(imgcol, imgcol_all);
/** addtional history average interpolation */
function his_interp(imgcol, imgcol_all){
    // Just for Albedo
    var imgcol_hisavg_d8    = pkg_trend.aggregate_prop(imgcol_all.select(0), 'dn', 'median').map(zip_albedo),
        imgcol_hisavg_1m = pkg_trend.aggregate_prop(imgcol_all.select(0), 'Month', 'median').map(zip_albedo),
        imgcol_hisavg_1y  = pkg_trend.aggregate_prop(imgcol_all.select(0), 'Year', 'median').map(zip_albedo);

    var imgcol_his_d8 = pkg_smooth.historyInterp(imgcol, imgcol_hisavg_d8   , 'dn');
    var imgcol_his_1m = pkg_smooth.historyInterp(imgcol_his_d8, imgcol_hisavg_1m, 'month');
    var imgcol_his_1y = pkg_smooth.historyInterp(imgcol_his_1m, imgcol_hisavg_1y , 'year');

    // print(imgcol_hisavg_d8, imgcol_hisavg_1m, imgcol_hisavg_1y)
    // print(imgcol_his_d8, imgcol_his_1m, imgcol_his_1y)

    var max = imgcol_his_1y.max();
    // Map.addLayer(max, {min:0, max:1e3}, 'max')
    return imgcol_his_1y;
}

/** export data */
var range      = [-180, -60, 180, 90], // keep consistent with modis data range
    range_high = [-180,  60, 180, 90], //
    cellsize   = 1 / 240,
    type       = 'asset',
    folder     = 'projects/pml_evapotranspiration/PML_INPUTS/MODIS/Albedo_interp_8d_hisavg', //Emiss_interp_8d
    crs        = 'SR-ORG:6974';
    // task    = 'whit-4y';
// var dateList   = ee.List(imgcol.filter(filter_date).aggregate_array('system:time_start'))
//             .map(function(date){ return ee.Date(date).format('yyyy-MM-dd'); }).getInfo();
// print(dateList)
// pkg_export.ExportImgCol(emiss_interp, dateList, range, cellsize, type, folder, crs);

/** continue history average interpolation */
function addProp(img){
    var date  = ee.Date(img.get('system:time_start'));
    var month = date.get('month').format('%02d');
    var year  = date.get('year').format('%d');
    return img.set('Month', month).set('Year', year);
}

function getReal_albedo(img){
    return img.multiply(0.001).copyProperties(img, img.propertyNames());
}
function zip_albedo(img){
    return img.toUint16().copyProperties(img, img.propertyNames()); //.multiply(1000)
}

// function zip_albedo(img){
//     var x = img.expression('b(0) * 1000').toUint16();
//     return img.select('qc').toUint8().addBands(x);
// }
/** addtional history average interpolation */


// var imgcol_albedo = ee.ImageCollection(imgcol_albedo.toList(1000))
//     .map(addProp);

    // .map(function(img) {
    //     var albedo = img.select(0).multiply(0.001);
    //     return img.select(1).addBands(albedo);
    // }).select([1, 0], ['Albedo', 'qc']);//scale factor 0.001, no units;

// var Albedo_d8 = imgcol_albedo.filter(filter_date);
//     Albedo_d8 = his_interp(Albedo_d8, imgcol_albedo).map(function(img){
//         var qc = img.select('qc').toUint8();
//         return img.select(0).toUint16().addBands(qc)
//             .copyProperties(img, img.propertyNames());
//     });

// var count2 = Albedo_d8.map(function(img){
//     return img.expression("b('qc') == 3");
// }).sum();

// var count1 = Albedo_d8.map(function(img){
//     return img.expression("b('qc') == 4");
// }).sum();

// Map.addLayer(count1, {}, 'count1');
// Map.addLayer(count2, {}, 'count2');

// Map.addLayer(imgcol_albedo, {}, 'origin');
// Map.addLayer(Albedo_d8, {}, 'Albedo_d8');
// print(Albedo_d8, dateList);
// pkg_export.ExportImgCol(emiss_interp, dateList, range, scale, drive, folder, crs);
// pkg_export.ExportImgCol(Albedo_d8, dateList, range, scale, drive, folder); //, crs
