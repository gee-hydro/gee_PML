/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var fluxpnts = ee.FeatureCollection("users/kongdd/shp/flux-212"),
    test_pnt = /* color: #d63000 */ee.Geometry.Point([140.00015258789062, -28.07622128384924]),
    ImgCol_gldas = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/GLDAS_v21_8day"),
    imgcol_albedo = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/Albedo_interp_8d_v2"),
    imgcol_emiss = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/Emiss_interp_8d"),
    imgcol_lai_4d = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/LAI_whit_4d"),
    co2 = ee.FeatureCollection("projects/pml_evapotranspiration/PML_INPUTS/co2_mm_gl_2002-2017_8day"),
    imgcol_gldas_raw = ee.ImageCollection("NASA/GLDAS/V021/NOAH/G025/T3H");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
/**
 * Prepare inputs for 8-day PML, e.g. MODIS LAI, Albedo, Emissivity and GLDAS 
 * meteorological forcing data.
 * 
 * Dongdong, 26 Feb, 2018
 * Dongdong, 02 Aug, 2019
 */
 
var pkg_join   = require('users/kongdd/public:pkg_join.js');
var pkg_trend  = require('users/kongdd/public:Math/pkg_trend.js');
var pkg_smooth = require('users/kongdd/public:Math/pkg_smooth.js');
var pkg_main   = require('users/kongdd/public:pkg_main.js');

var prop_d8 = ['system:time_start', 'system:id', 'd8']; // 8 days ImgCol essential properties
// var filter_date  = ee.Filter.date('2002-07-01', '2017-12-31');

//////////////////////////////////////////////////////////////////////////////////////

// Map.addLayer(mask, {}, 'mask');
// Map.addLayer(mean_albedo, {}, 'mean_albedo');
// Map.addLayer(mean_emiss , {}, 'mean_emiss');

// var filter_date2 = ee.Filter.date('2014-07-01', '2016-12-31');

/** 0. import co2 data from fusion table */
// var f = co2.toList(co2.size()).get(0);
// // f = ee.Feature(f);
// var img = ee.Image.constant(f.get('average'));
// print(img);

var ImgCol_co2 = co2.toList(co2.size()).map(function(f){
    f = ee.Feature(f);
    var date = ee.Date.parse('YYYY-MM-dd', f.get('date'));
    // print(date);
    return ee.Image.constant(f.get('average'))
        .toFloat()
        .set('system:time_start', date.millis())
        .set('system:id', date.format('YYYY-MM-dd'))
        .set('system:index', date.format('YYYY-MM-dd'));
});
// ImgCol_co2 = ee.ImageCollection(ImgCol_co2).select([0], ['co2'])
//     .filter(filter_date);

// imgCol_gldas = imgCol_gldas.filter(filter_date);
// imgCol_gldas = pkg_join.SaveBest(imgCol_gldas, ImgCol_co2);
// print(ImgCol_gldas);

////////////////////////////////////////////////////////////////////////////
/** MODIS LAI, Albedo, Emiss */
// var ImgCol_Albedo = ee.List.sequence(2002, 2016).iterate(function(year, first){
//     var imgcol = fun_albedo(year);
//     return ee.ImageCollection(first).merge(imgcol);
// }, ee.ImageCollection([]));

/**
 * [gldas_inputs_d8 description]
 *
 * @param  {[type]} date_begin     [description]
 * @param  {[type]} date_end       [description]
 * @param  {[type]} dailyImg_iters : hour3ToDaily need it
 * @return {[type]}                [description]
 */
function gldas_inputs_d8(date_begin, date_end, dailyImg_iters){
    date_end = ee.Date(date_end).advance(1, 'day'); // for filterDate
    var gldas_raw = ee.ImageCollection("NASA/GLDAS/V021/NOAH/G025/T3H")
        .filterDate(date_begin, date_end)
        .map(pkg_trend.add_dn_date);
    
    var Tair_3h = gldas_raw.select(['Tair_f_inst']);
    //  temperature is special, need to calculate daily max, min, mean first.
    var Tmax = pkg_trend.hour3Todaily(Tair_3h, dailyImg_iters, 'max');  //.select([0], ['Tmax']);
    var Tmin = pkg_trend.hour3Todaily(Tair_3h, dailyImg_iters, 'min');  //.select([0], ['Tmin']);
    // Tavg = (Tmax + Tmin)/2
    var Tavg = pkg_trend.hour3Todaily(Tair_3h, dailyImg_iters, 'mean'); //.select([0], ['Tavg']);

    var gldas_Tair_d1 = Tmax.combine(Tmin).combine(Tavg)
        .map(function(img){
            return img.subtract(273.15)
                .copyProperties(img, ['system:time_start', 'system:id', 'dn']); // K convert to degC
        });
    var gldas_Tair = pkg_trend.aggregate_prop(gldas_Tair_d1, 'dn', 'mean').select([0, 1, 2], ['Tmax', 'Tmin', 'Tavg']);
    // var gldas_accu = pkg_trend.aggregate_prop(gldas_raw.select(['Rainf_f_tavg']), 'd8', 'sum')
    //     .map(function(img){ return img.multiply(3600 * 3).copyProperties(img, ['system:id']);})
    //     .select([0], ['Prcp']);
    var gldas_inst = pkg_trend.aggregate_prop(gldas_raw.select(['Qair_f_inst', 'LWdown_f_tavg', 'SWdown_f_tavg', 'Psurf_f_inst', 'Wind_f_inst', 'Rainf_f_tavg']), 'dn', 'mean')  
        .map(function(img){
            var Q_Ra = img.select([0, 1, 2]);           // ['q'], Specific humidity, kg/kg
                                                        // ['Rln', 'Rs'] , W/m2/s 
            var Pa = img.select([3]).divide(1000);      // ['Pa'] cnovert to kPa
            var U2 = img.expression('U10*4.87/log(67.8*10-5.42)', {U10:img.select([4])}); //gldas wind height is 10m
            var prcp = img.select([5]).multiply(86400); // ['Prcp'], kg/m2/s to mm
            return Q_Ra.addBands([Pa, U2, prcp]);
        }).select([0, 1, 2, 3, 4, 5], ['q', 'Rln', 'Rs', 'Pa', 'U2', 'Prcp']);
    
    var gldas = gldas_Tair.combine(gldas_inst); 
    return gldas;
}

//////////////////////// MAIN FUNCTIONS FOR GLDAS /////////////////////////////
///////////////////////////////////////////////////////////////////////////////
var date2str = function(date) { return ee.Date(date).format('yyyy-MM-dd'); };

var IS_RUN = true;
if (IS_RUN){
    // aggregate 3hourly gldas into 8day and save into assets
    var year_begin = 2019,
        year_end   = 2019; 
    
    var date_begin = ee.Date(year_begin.toString().concat("-01-01")),
        date_end   = ee.Date(year_end.toString().concat("-12-31"));
    
    var img_last  = pkg_trend.imgcol_last(imgcol_gldas_raw.select(0).filterDate(date_begin, date_end));
    var date_end2 = ee.Date(img_last.get('system:time_start'));
    // print(img_last, date_end2);
    
    /** dates of output 8-day GLDAS ----------------------------------------- */
    var dates = [];
    for (var year = year_begin; year <= year_end; year++) {
        var DATE_BEGIN = ee.Date(year.toString().concat("-01-01"));
        var DATE_END   = ee.Date(year.toString().concat("-12-31"));
        if (year == year_end) DATE_END = date_end2;
        var dates_year = ee.List.sequence(DATE_BEGIN.millis(), DATE_END.millis(), 86400000*8)
            .map(date2str).getInfo(); // 8-day dates
        dates = dates.concat(dates_year);
    }
    // print('dates', dates);
    
    /** Aggregate into 8-day ------------------------------------------------ */
    var dailyImg_iters = pkg_trend.dailyImgIters(date_begin, date_end);
    var gldas_input = gldas_inputs_d8(date_begin, date_end, dailyImg_iters).sort('system:time_start');
    // print(dailyImg_iters, 'dailyImg_iters');
    // var pml_input = PML_INPUTS_d8(date_begin, date_end, dailyImg_iters);
    // print(gldas_input); //gldas_input, pml_input

    var pkg_export = require('users/kongdd/public:pkg_export.js');
    pkg_export.ExportImgCol(gldas_input, dates, [-180, -60, 180, 90], 0.25, 
        'asset', 'projects/pml_evapotranspiration/PML_INPUTS/GLDAS_V21_8day_V2');
        
    // var inputs = ee.List.sequence(2002, 2016).iterate(function(year, first){
    // var imgcol = PML_INPUTS_d8(year);
    //     return ee.ImageCollection(first).merge(imgcol);
    // }, ee.ImageCollection([]));
}
// var inputs = PML_INPUTS_d8(2009).aside(print);

var DEBUG = false;
if (DEBUG){
    // 1. check about file nums
    filter_col(imgCol_gldas, 2000, 2019);
    
    // 2. check about spatial dist
    var imgcol_2018 = imgCol_gldas.filter(ee.Filter.calendarRange(2018, 2018, 'year')).mean();
    var imgcol_2017 = imgCol_gldas.filter(ee.Filter.calendarRange(2017, 2017, 'year')).mean();
    
    Map.addLayer(imgcol_2017, {}, 'imgcol_2017');
    Map.addLayer(imgcol_2018, {}, 'imgcol_2018');
    
    var diff = imgcol_2018.subtract(imgcol_2017);
    Map.addLayer(diff, {}, '2018-2017');
}

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

exports = {
    gldas_inputs_d8 : gldas_inputs_d8,
};
