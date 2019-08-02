/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var imgcol_gpp = ee.ImageCollection("MODIS/006/MOD17A2H"),
    imgcol_v2 = ee.ImageCollection("projects/pml_evapotranspiration/PML/OUTPUT/PML_V2_8day");
/***** End of imports. If edited, may not auto-convert in the playground. *****/

var pkg_trend  = require('users/kongdd/public:Math/pkg_trend.js');
var pkg_smooth = require('users/kongdd/public:Math/pkg_smooth.js');
var pkg_export = require('users/kongdd/public:pkg_export.js');

/** 
 * This script is to fill gaps of MODIS Albedo, Emissivity with the methods of 
 * nearest linear regression, (d8, monthly, yearly) historical average interpolation.
 *
 * Update for PML_V2 2018 images
 * 
 * 2019-08-02
 * Dongdong Kong
 */

/** parameters */
var range = [-180, -60, 180, 90];
var bound = ee.Geometry.Rectangle(range, 'EPSG:4326', false);

var nday       = 32; // interpolation searching 32d in the left and right
var year_begin = 2012,
    year_end   = year_begin + 2;

var md_begin = (year_begin === 2002) ? '-07-04' : '-01-01';
var date_begin = ee.Date(year_begin.toString().concat(md_begin)).advance(-nday, 'day'),
    date_end   = ee.Date(year_end.toString().concat('-12-31')).advance(nday, 'day');
    
var filter_date  = ee.Filter.date(date_begin, date_end);
var filter_date2 = ee.Filter.date(date_begin.advance(nday, 'day'), date_end.advance(-nday, 'day'));


/**  Aggregate Albedo from daily to 8-day ----------------------------------- */
var Albedo_raw  = ee.ImageCollection('MODIS/006/MCD43A3')
        .select(['Albedo_WSA_shortwave']) //, ['albedo'], 'BRDF_Albedo_Band_Mandatory_Quality_shortwave'
        .map(pkg_trend.add_dn(true, 8));
// Map.addLayer(Albedo_raw.limit(365), {}, 'albedo');

var Albedo_d8 = pkg_trend.aggregate_prop(Albedo_raw, 'dn', 'median')
    //scale factor 0.001, no units;
    .map(function(img){ return img.multiply(0.001).copyProperties(img, img.propertyNames()); })
    .map(pkg_trend.add_dn(false, 8))
    .select([0], ['Albedo']);
// print(Albedo_d8.limit(3))
// Map.addLayer(Albedo_d8.limit(92), {}, 'albedo raw');

var Emiss_d8 = ee.ImageCollection('MODIS/006/MOD11A2')
    .select(['Emis_31', 'Emis_32'])
    .map(function(img) {
        // return img.addBands(img.reduce(ee.Reducer.mean()).multiply(0.002).add(0.49)).select([2]);
        return img.reduce(ee.Reducer.mean()).multiply(0.002).add(0.49)
            .copyProperties(img, ['system:time_start', 'system:id']);
    }).select([0], ['Emiss'])
    .map(pkg_trend.add_dn(false, 8));

var prj_albedo = pkg_export.getProj(Albedo_raw);
var prj_emiss  = pkg_export.getProj(Emiss_d8); // prj_emiss.prj

var dateList = ee.List(Emiss_d8.filter(filter_date2).aggregate_array('system:time_start'))
    .map(function(date){ return ee.Date(date).format('yyyy-MM-dd'); }).getInfo();

/** common parameters ------------------------------------------------------- */
var type = 'emiss';
var imgcol_all, cellsize, folder, zipfun, prj;
if (type === 'albedo'){
    imgcol_all = Albedo_d8;
    cellsize   = 1/240;
    folder     = 'projects/pml_evapotranspiration/PML_INPUTS/MODIS/Albedo_interp_8d_linear'; //Emiss_interp_8d
    zipfun     = zip_albedo;
    prj        = prj_albedo;
}else if (type === 'emiss'){
    imgcol_all = Emiss_d8;
    cellsize   = 1/120;
    folder     = 'projects/pml_evapotranspiration/PML_INPUTS/MODIS/Emiss_interp_8d'; //Emiss_interp_8d
    zipfun     = zip_emiss;
    prj        = prj_emiss;
}
print('[running]', type);

// imgcol_all      = ee.ImageCollection(imgcol_all.toList(1000, 0))
//     .map(pkg_trend.add_dn(false, 8))
///////////////////////////////////////////////////////////////////
// print(imgcol_all, 'imgcol_all');

var prop            = 'dn',
    imgcol_input    = imgcol_all.filter(filter_date),
    imgcol_his_mean = pkg_trend.aggregate_prop(imgcol_all.select(0), prop, 'median');

// print(imgcol_input)
// print(dateList);
var imgcol_interp = pkg_smooth.linearInterp(imgcol_input, nday); //.combine(imgcol);

var imgcol_hisavg_d8    = pkg_trend.aggregate_prop(imgcol_all.select(0), 'dn'   , 'median'), //.map(zip_albedo),
    imgcol_hisavg_month = pkg_trend.aggregate_prop(imgcol_all.select(0), 'Month', 'median'), //.map(zip_albedo),
    imgcol_hisavg_year  = pkg_trend.aggregate_prop(imgcol_all.select(0), 'Year' , 'median'); //.map(zip_albedo);

var imgcol_his_d8 = pkg_smooth.historyInterp(imgcol_interp, imgcol_hisavg_d8   , 'dn');
var imgcol_his_1m = pkg_smooth.historyInterp(imgcol_his_d8, imgcol_hisavg_month, 'Month');
var imgcol_his_1y = pkg_smooth.historyInterp(imgcol_his_1m, imgcol_hisavg_year , 'Year');
var imgcol_out    = imgcol_his_1y; // final smoothed result
var imgcol_out = imgcol_interp.filter(filter_date2).map(zipfun).select([1, 0]);

var DEBUG = true;
if (DEBUG) {
    print(imgcol_all.limit(3));
    // print(imgcol, imgcol_interp);
    print('historical imgcol', imgcol_hisavg_d8, imgcol_hisavg_month, imgcol_hisavg_year);
    print('interped imgcol', imgcol_his_d8, imgcol_his_1m, imgcol_his_1y);
    // print(imgcol_his)
    // print(imgcol_input, imgcol_out)

    get_chart(imgcol_all.filter(filter_date), 'imgcol_all');
    get_chart(imgcol_interp, 'imgcol_interp');
    get_chart(imgcol_his_1y, 'imgcol_his_1y');    
}

// var imgcol_his_year  = pkg_smooth.historyInterp(imgcol_his_month, imgcol_hisavg_year , 'Year');
// var imgcol_his    = historyInterp(imgcol_interp);

// var emiss_interp  = imgcol_his.map(zip_emiss).select([1, 0]);
// var imgcol_out  = imgcol_his.filter(filter_date2).map(zip_emiss).select([1, 0]);
// var folder = 'projects/pml_evapotranspiration/PML_INPUTS/MODIS/Emiss_interp_8d'; 

/** EXPORT DATA ------------------------------------------------------------- */

var range      = [-180, -60, 180, 90], // keep consistent with modis data range
    range_high = [-180, 60, 180, 90],  //
    // cellsize   = 1 / 240,
    type       = 'asset',
    crs        = 'SR-ORG:6974';
    // task = 'whit-4y';

pkg_export.ExportImgCol(imgcol_out, dateList.limit(2), range, cellsize, type, folder, 
    crs, prj.crsTransform);

// print(imgcol_out.limit(2));
// print(dateList);
// pkg_export.ExportImgCol(emiss_interp, dateList, range, scale, drive, folder, crs);
print(prj_albedo, prj_emiss);
// pkg_export.ExportImgCol(imgcol_out.limit(10), dateList, range, cellsize, type, folder, 
//     crs, prj.crsTransform);

//////////////////////////// MAIN FUNCTIONS ////////////////////////////////////
function get_chart(imgcol, name){
  var point = /* color: #d63000 */ee.Geometry.Point([-104.48822021484375, 65.42901140039487]);

  var chart = ui.Chart.image.series({
      imageCollection: imgcol, //['ETsim', 'Es', 'Eca', 'Ecr', 'Es_eq']
      region         : point,
      reducer        : ee.Reducer.mean(),
      scale          : 500
  });
  print(chart, name);
}

/** count images number */
function count_imgcol(imgcol){
    var img_count = imgcol.count();
    // img_count = img_count.mask(img_count.lt(46));
    return img_count;
}

// scale:0.002  offset:0.49
function zip_emiss(img){
    var x = img.expression('(b(0) - 0.49)*500');
    return img.select('qc').addBands(x).toUint8();
}

// scale:0.001
function zip_albedo(img){
    var x = img.expression('b(0) * 1000').toUint16();
    return img.select('qc').toUint8().addBands(x);
}

// print(albedo_interp);
// var point = ee.Geometry.Point([-104.48822021484375, 65.42901140039487]);
// var chart = ui.Chart.image.series({
//         imageCollection: imgcol_out, //['ETsim', 'Es', 'Eca', 'Ecr', 'Es_eq']
//         region         : point,
//         reducer        : ee.Reducer.mean(),
//         scale          : 500
//     });
// print(chart);

// Map.centerObject(point, 16);
// Map.addLayer(point     , {}, 'point');

// Map.addLayer(imgcol_input, {}, 'imgcol_input');
// Map.addLayer(Albedo_d8.limit(46), {}, 'Albedo_d8');
// Map.addLayer(imgcol_his, {}, 'imgcol_his');

// var count_mod = imgcol_gpp.count();
// var count_v2  = imgcol_v2.count();

// Map.addLayer(count_mod, {max:46, min:0}, 'count_mod');
// Map.addLayer(count_v2, {max:46, min:0}, 'count_v2');
// Map.addLayer(count_yearly(Albedo_d8), {max:46, min:0}, 'Albedo_d8 count');
// Map.addLayer(Albedo_d8, {}, 'Albedo_d8');

// Map.addLayer(count_yearly(Emiss_d8) , {max:46, min:0}, 'Emiss_d8 count');
// Map.addLayer(Emiss_d8 , {}, 'Emiss_d8');

// print(emiss_interp);

// Map.addLayer(img_out, {}, 'img_out');
// pkg_export.ExportImg(img_out, range, task, scale, drive, folder, crs);

// imgcol_gpp = imgcol_gpp.filter(ee.Filter.calendarRange(2010, 2010, 'year'));
// imgcol_v2  = imgcol_v2.filter(ee.Filter.calendarRange(2010, 2010, 'year'));

// print(imgcol_gpp);

// var img  = ee.Image(Emiss_d8.first());
// var mask = img.mask();
// img = img.where(mask.not(), 999);
// Map.addLayer(mask, {}, 'mask');
// Map.addLayer(img , {}, 'img');

// pkg_smooth.
// print('imgcol', imgcol)

// var imgcol_his_mean = pkg_trend.aggregate_prop(imgcol.select(0), prop, 'median');
// print(emiss_interp, 'emiss_interp');

// var count_his = count_yearly(imgcol_his.select([0]));
// var count     = count_yearly(imgcol_interp.select([0]));
// count = count_his;
// Map.addLayer(count_his, {}, 'count_his');

// Map.addLayer(imgcol_interp, {}, 'interp');
// Map.addLayer(imgcol_his, {}, 'his');
// Map.addLayer(count , {max:46, min:0}, 'Interp Emiss_d8 count');

// var hist = count.reduceRegion({
//     reducer: ee.Reducer.percentile({ percentiles: [1, 2, 10, 90, 98, 99], outputNames: null }),
//     geometry: bound,
//     scale: 25000,
// });
// var hist_es = ui.Chart.image.histogram({
//         image: count,
//         region: bound, //Tavg.geometry(),
//         scale: 25000,
//         // minBucketWidth: 0
//     })
//     .setOptions({ title: 'goal (mm)', vAxis: { title: 'ET (mm/d)' } });
// print(hist);
// print(hist_es);
