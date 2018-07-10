/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var imgcol_gpp = ee.ImageCollection("MODIS/006/MOD17A2H"),
    imgcol_v2 = ee.ImageCollection("projects/pml_evapotranspiration/PML/OUTPUT/PML_V2_8day");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var pkg_trend  = require('users/kongdd/public:Math/pkg_trend.js');
var pkg_smooth = require('users/kongdd/public:Math/pkg_smooth.js');
var pkg_export = require('users/kongdd/public:pkg_export.js');

/** parameters */
var range = [-180, -60, 180, 90];
var bound = ee.Geometry.Rectangle(range, 'EPSG:4326', false);

var nday       = 32; // interpolation searching 32d in the left and right
var year_begin = 2012,
    year_end   = year_begin + 5,
    date_begin = ee.Date(year_begin.toString().concat('-01-01')).advance(-nday, 'day'),
    date_end   = ee.Date(year_end.toString().concat('-12-31')).advance(nday, 'day');
    
var filter_date  = ee.Filter.date(date_begin, date_end);
var filter_date2 = ee.Filter.date(date_begin.advance(nday, 'day'), date_end.advance(-nday, 'day'));

/** functions */
function count_yearly(imgcol){
    var img_count = imgcol.count();
    // img_count = img_count.mask(img_count.lt(46));
    return img_count;
}

/** Interpolation not considering weights */
var addTimeBand = function(img) {
    /** make sure mask is consistent */
    var mask = img.mask();
    var time = img.metadata('system:time_start').rename("time").mask(mask);
    return img.addBands(time);
};

// bug found here, Uint8 or Uint16 can't have -999;
function replace_mask(img, newimg) {
    img = img.unmask(-999);
    img = img.where(img.eq(-999), newimg);
    img = img.updateMask(img.neq(-999));
    return img;
}

// scale:0.002	offset:0.49
function zip_emiss(img){
    var x = img.expression('(b(0) - 0.49)*500');
    return img.select('qc').addBands(x).toUint8();
}
// scale:0.001
function zip_albedo(img){
    var x = img.expression('b(0) * 1000').toUint16();
    return img.select('qc').toUint8().addBands(x);
}

////////////////////////////////////////////////////////////////////////
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

/** common parameters */
var type = 'albedo';

var imgcol_all, scale, folder, zipfun;
if (type === 'albedo'){
    print('[running]', type);
    imgcol_all = Albedo_d8;
    scale  = 1/240;
    folder = 'projects/pml_evapotranspiration/PML_INPUTS/MODIS/Albedo_interp_8d'; //Emiss_interp_8d
    zipfun = zip_albedo;
}else if (type === 'emiss'){
    print('[running]', type);
    imgcol_all = Emiss_d8;
    scale  = 1/120;
    folder = 'projects/pml_evapotranspiration/PML_INPUTS/MODIS/Emiss_interp_8d'; //Emiss_interp_8d
    zipfun = zip_emiss;
}
// imgcol_all      = ee.ImageCollection(imgcol_all.toList(1000, 0))
//     .map(pkg_trend.add_dn(false, 8))
///////////////////////////////////////////////////////////////////
var prop            = 'dn',
    imgcol_input    = imgcol_all.filter(filter_date),
    imgcol_his_mean = pkg_trend.aggregate_prop(imgcol_all.select(0), prop, 'median');


var imgcol_interp = linearInterp(imgcol_input, nday); //.combine(imgcol);

// var imgcol_hisavg_month = pkg_trend.aggregate_prop(imgcol_all.select(0), 'Month', 'median').map(zip_albedo),
//     imgcol_hisavg_year  = pkg_trend.aggregate_prop(imgcol_all.select(0), 'Year', 'median').map(zip_albedo);

// print(imgcol_all, imgcol_interp, 'linear')
// print(imgcol_hisavg_month, imgcol_hisavg_year);
var imgcol_his = historyInterp(imgcol_interp, imgcol_his_mean, prop);
// print(imgcol_input);
// print(imgcol_his)


var point = /* color: #d63000 */ee.Geometry.Point([-104.48822021484375, 65.42901140039487]);
var chart = ui.Chart.image.series({
        imageCollection: imgcol_his, //['ETsim', 'Es', 'Eca', 'Ecr', 'Es_eq']
        region         : point,
        reducer        : ee.Reducer.first(),
        scale          : 5000
    });
print(chart);

// var imgcol_his_year  = pkg_smooth.historyInterp(imgcol_his_month, imgcol_hisavg_year , 'Year');
// var imgcol_his    = historyInterp(imgcol_interp);

// var emiss_interp  = imgcol_his.map(zip_emiss).select([1, 0]);
// var imgcol_out  = imgcol_his.filter(filter_date2).map(zip_emiss).select([1, 0]);
// var folder = 'projects/pml_evapotranspiration/PML_INPUTS/MODIS/Emiss_interp_8d'; 
// print(imgcol_his)
var imgcol_out = imgcol_his.filter(filter_date2).map(zipfun).select([1, 0]);


/** export data */
var range      = [-180, -60, 180, 90], // keep consistent with modis data range
    range_high = [-180, 60, 180, 90], //
    // scale = 1 / 240,
    drive = false,
    crs = 'SR-ORG:6974';
    // task = 'whit-4y';
var dateList = ee.List(imgcol_input.filter(filter_date2).aggregate_array('system:time_start'))
            .map(function(date){ return ee.Date(date).format('yyyy-MM-dd'); }).getInfo();

// print(imgcol_out);
// pkg_export.ExportImgCol(emiss_interp, dateList, range, scale, drive, folder, crs);
// pkg_export.ExportImgCol(imgcol_out, dateList, range, scale, drive, folder, crs);

function linearInterp(imgcol, frame){
    if (typeof frame === 'undefined') { frame = 32; }
    // var frame = 32;
    var time   = 'system:time_start';
    imgcol = imgcol.map(addTimeBand);
    
    // We'll look for all images up to 32 days away from the current image.
    var maxDiff = ee.Filter.maxDifference(frame * (1000*60*60*24), time, null, time);
    var cond    = {leftField:time, rightField:time};
    
    // Images after, sorted in descending order (so closest is last).
    //var f1 = maxDiff.and(ee.Filter.lessThanOrEquals(time, null, time))
    var f1 = ee.Filter.and(maxDiff, ee.Filter.lessThanOrEquals(cond));
    var c1 = ee.Join.saveAll({matchesKey:'after', ordering:time, ascending:false})
        .apply(imgcol, imgcol, f1);
    
    // Images before, sorted in ascending order (so closest is last).
    //var f2 = maxDiff.and(ee.Filter.greaterThanOrEquals(time, null, time))
    var f2 = ee.Filter.and(maxDiff, ee.Filter.greaterThanOrEquals(cond));
    var c2 = ee.Join.saveAll({matchesKey:'before', ordering:time, ascending:true})
        .apply(c1, imgcol, f2);
    
    // print(c2, 'c2');
    // var img = ee.Image(c2.toList(1, 15).get(0));
    // var mask   = img.select([0]).mask();
    // Map.addLayer(img , {}, 'img');
    // Map.addLayer(mask, {}, 'mask');
    
    var interpolated = ee.ImageCollection(c2.map(function(img) {
        img = ee.Image(img);

        var before = ee.ImageCollection.fromImages(ee.List(img.get('before'))).mosaic();
        var after  = ee.ImageCollection.fromImages(ee.List(img.get('after'))).mosaic();
        
        img = img.set('before', null).set('after', null);
        // constrain after or before no NA values, confirm linear Interp having result
        before = replace_mask(before, after);
        after  = replace_mask(after , before);
        
        // Compute the ratio between the image times.
        var x1 = before.select('time').double();
        var x2 = after.select('time').double();
        var now = ee.Image.constant(img.date().millis()).double();
        var ratio = now.subtract(x1).divide(x2.subtract(x1));  // this is zero anywhere x1 = x2
        // Compute the interpolated image.
        before = before.select(0); //remove time band now;
        after  = after.select(0);
        img    = img.select(0); 
        
        var interp = after.subtract(before).multiply(ratio).add(before);
        // var mask   = img.select([0]).mask();
        
        var qc = img.mask().not().rename('qc');
        interp = replace_mask(img, interp);
        // Map.addLayer(interp, {}, 'interp');
        return interp.addBands(qc).copyProperties(img, ['system:time_start', 'system:id']);
    }));
    return interpolated;
}

/** all those interpolation functions are just designed for 8-day temporal scale */
function historyInterp(imgcol, imgcol_his_mean, prop){
    if (typeof prop === 'undefined') { prop = 'd8'; }
    // var imgcol_his_mean = pkg_trend.aggregate_prop(imgcol.select(0), prop, 'median');
    
    var f = ee.Filter.equals({leftField:prop, rightField:prop});
    var c = ee.Join.saveAll({matchesKey:'history', ordering:'system:time_start', ascending:true})
        .apply(imgcol, imgcol_his_mean, f);
    // print(c);
    
    var interpolated = ee.ImageCollection(c.map(function(img) {
        img = ee.Image(img);
        
        var history = ee.Image(ee.List(img.get('history')).get(0));
        var props   = img.propertyNames().remove('history');
        img  = img.set('history', null);
        
        var qc = img.select('qc');
        img    = img.select(0);
        
        qc = qc.add(img.mask().not()); // 0:good value, 1:linear interp; 2:his interp
        var interp  = replace_mask(img, history);
        return interp.addBands(qc);//.copyProperties(img, ['system:time_start', 'system:id', prop]);
    }));
    // print(interpolated, 'interpolated');
    return interpolated;
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
// pkg_export.ExportImg_deg(img_out, range, task, scale, drive, folder, crs);

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