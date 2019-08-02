/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var fluxpnts = ee.FeatureCollection("users/kongdd/shp/flux-212"),
    Albedo_raw = ee.ImageCollection("MODIS/006/MCD43A3"),
    test_pnt = /* color: #d63000 */ee.Geometry.Point([140.00015258789062, -28.07622128384924]),
    lands = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/MCD12Q1_006"),
    ImgCol_gldas = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/GLDAS_v21_8day"),
    co2 = ee.FeatureCollection("ft:1trgP0M8MslxSolLNQFY-utpFlC2a14ySSFaZegy5"),
    imgcol_albedo = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/Albedo_interp_8d"),
    imgcol_albedo2 = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/Albedo_interp_8d_v2"),
    imgcol_emiss = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/Emiss_interp_8d"),
    imgcol_lai_4d = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/LAI_whit_4d");
/***** End of imports. If edited, may not auto-convert in the playground. *****/

/**
 * Prepare inputs for 8-day PML, e.g. MODIS LAI, Albedo, Emissivity and GLDAS 
 * meteorological forcing data.
 * 
 * Dongdong Kong, 26 Feb, 2018
 */
 
var pkg_join   = require('users/kongdd/public:pkg_join.js');
var pkg_trend  = require('users/kongdd/public:Math/pkg_trend.js');
var pkg_smooth = require('users/kongdd/public:Math/pkg_smooth.js');
var pkg_main   = require('users/kongdd/public:pkg_main.js');

var prop_d8 = ['system:time_start', 'system:id', 'd8']; // 8 days ImgCol essential properties
var filter_date  = ee.Filter.date('2002-07-01', '2017-12-31');

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
ImgCol_co2 = ee.ImageCollection(ImgCol_co2).select([0], ['co2'])
    .filter(filter_date);

ImgCol_gldas = ImgCol_gldas.filter(filter_date);
ImgCol_gldas = pkg_join.SaveBest(ImgCol_gldas, ImgCol_co2);
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
    var gldas_raw = ee.ImageCollection("NASA/GLDAS/V021/NOAH/G025/T3H")
        .filterDate(date_begin, date_end)
        .map(pkg_trend.add_d8);

    var Tair_3h = gldas_raw.select(['Tair_f_inst']);
    //  temperature is special, need to calculate daily max, min, mean first.
    var Tmax = pkg_trend.hour3Todaily(Tair_3h, dailyImg_iters, 'max');  //.select([0], ['Tmax']);
    var Tmin = pkg_trend.hour3Todaily(Tair_3h, dailyImg_iters, 'min');  //.select([0], ['Tmin']);
    // Tavg = (Tmax + Tmin)/2
    var Tavg = pkg_trend.hour3Todaily(Tair_3h, dailyImg_iters, 'mean'); //.select([0], ['Tavg']);

    var gldas_Tair_d1 = Tmax.combine(Tmin).combine(Tavg)
        .map(function(img){
            return img.subtract(273.15)
                .copyProperties(img, ['system:time_start', 'system:id', 'd8']); // K convert to degC
        });
    var gldas_Tair = pkg_trend.aggregate_prop(gldas_Tair_d1, 'd8', 'mean').select([0, 1, 2], ['Tmax', 'Tmin', 'Tavg']);
    // var gldas_accu = pkg_trend.aggregate_prop(gldas_raw.select(['Rainf_f_tavg']), 'd8', 'sum')
    //     .map(function(img){ return img.multiply(3600 * 3).copyProperties(img, ['system:id']);})
    //     .select([0], ['Prcp']);
    var gldas_inst = pkg_trend.aggregate_prop(gldas_raw.select(['Qair_f_inst', 'LWdown_f_tavg', 'SWdown_f_tavg', 'Psurf_f_inst', 'Wind_f_inst', 'Rainf_f_tavg']), 'd8', 'mean')  
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
/** EXAMPLES */
var debug = true;
if (debug){
    // aggregate 3hourly gldas into 8day and save into assets
    var year_begin = 2017,
        year_end   = 2017; 
    var date_begin = ee.Date(year_begin.toString().concat("-01-01")),
        date_end   = ee.Date(year_end.toString().concat("-12-31"));
        
    // var gldas_raw = ee.ImageCollection("NASA/GLDAS/V021/NOAH/G025/T3H")
    //     .filterDate(date_begin, date_end).aside(print);
        
    var dailyImg_iters = pkg_trend.dailyImgIters(date_begin, date_end);
    // print(dailyImg_iters, 'dailyImg_iters');
    var gldas_input = gldas_inputs_d8(date_begin, date_end, dailyImg_iters).sort('system:time_start');
    // var pml_input = PML_INPUTS_d8(date_begin, date_end, dailyImg_iters);
    print(gldas_input); //gldas_input, pml_input
    
    /** multiple years 8days date */
    var dates = ee.List.sequence(year_begin, year_end).map(function(year){
        year = ee.Number(year).int().format('%d');
        var begin_date = ee.Date(year.cat("-01-01"));
        var end_date   = ee.Date(year.cat("-12-31"));
        return ee.List.sequence(begin_date.millis(), end_date.millis(), 86400000*8);
    });
    var daily_iters = dates.flatten().map(function(str) { return ee.Date(str)});
    print(daily_iters);
    
    var pkg_export = require('users/kongdd/public:pkg_export.js');
    pkg_export.ExportImgCol(gldas_input, daily_iters, [-180, -60, 180, 90], 0.25, 
        false,'projects/pml_evapotranspiration/PML_INPUTS/GLDAS_v21_8day');
        
    // var inputs = ee.List.sequence(2002, 2016).iterate(function(year, first){
    // var imgcol = PML_INPUTS_d8(year);
    //     return ee.ImageCollection(first).merge(imgcol);
    // }, ee.ImageCollection([]));
    
}
// var inputs = PML_INPUTS_d8(2009).aside(print);
    
exports = {
    PML_INPUTS_d8 : PML_INPUTS_d8,
};
