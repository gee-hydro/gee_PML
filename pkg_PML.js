/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var imageCollection = ee.ImageCollection("MODIS/006/MCD12Q1");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var pkg_PML = {};
// var pkg_PML = require('users/kongdd/gee_PML:pkg_PML.js');

/** PML GLOBAL PARAMETERS */
/**
var Gsc = 0.0820,  // solar constant in unit MJ m-2 min-1,
    as = 0.25,    // parameter Rs/Ra=as+bs*n/N; calibration from our solar radiation measurement
    bs = 0.50,    // parameter Rs/Ra=as+bs*n/N;
    alfa = 0.23,    // surface albedo of grass
    alfa_forest = 0.22,    // surface albedo of forest
    alfa_crop = 0.14,    // surface albedo of crop

    kmar = 0.40,    // von Karman's constant 0.40 
    Zob = 15,      // m, making sure higher than hc
    Cp = 1.0164,  // 4.2 * 0.242, specific heat at constant pressure, 1.013  [J g-1 0C-1]
    epsl = 0.622;   // ratio molecular weight of water vapour/dry air
*/
    /** PML_v1 parameters for Gc */
var kQ = 0.4488,  // extinction coefficient
    kA = 0.7,     // the attenuation of net all-wave irradicance, typically about 0.6-0.8 (Denmend, 1976, Kelliher FM et al., (1995))
    Q50 = 30,      // the value of absorbed PAR when gs=gsx/2, W/m2
    D0 = 0.7;     // the value of VPD when stomtal conductance is reduced  kpa 

/**
MODIS 005 IGBP land cover code
% 0 Water Bodies
% 1 Evergreen Needleleaf Forest
% 2 Evergreen Broadleaf Forest
% 3 Deciduous Needleleaf Forest
% 4 Deciduous Broadleaf Forest
% 5 Mixed Forest
% 6 Closed Shrublands
% 7 Open Shrublands
% 8 Woody Savannas
% 9 Savannas
% 10 Grasslands
% 11 Permanent Wetlands
% 12 Croplands
% 13 Urban and Built-Up
% 14 Cropland/Natural Vegetation Mosaic
% 15 Permanent Snow and Ice
% 16 Barren or Sparsely Vegetated
% 17 Unclassified

/**
006 landcover 
0  | UNC
17 | WATER
 */
 
/** parameters in the order of MCD12Q1.005; fix MCD12Q1_006 land cover code. */
pkg_PML.imgcol_land = ee.ImageCollection("MODIS/006/MCD12Q1").select(0).map(function (land) {
    //for MCD12Q1_006 water and unc type is inverse
    land = land.remap([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
        [17, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 0]);
    return (land);
});

function seq(from, to, by) {
    by = by || 1;
    var res = [];
    for (var i = from; i <= to; i += by) { res.push(i); }
    return res;
}

/**
 * SEVEN OPTIMIZED PARAMETERS
 * 
 * Alpha  : initial photochemical efficiency, 0.02-0.08
 * Thelta : the initla slope of the slope of CO2 response curve[umol m-2 s-1]/[umol mol-1], 1
 * m      : Ball-Berry coefficient 2-20
 * Am_25  : the maximum catalytic capacity of Rubisco per unit leaf area at 25 degree
 * kQ     : the value of VPD when stomtal conductance is reduced 
 * kA     : extinction coefficient
 *
 * TWO INTERCEPTION PARAMETERS
 * S_sls  : specific canopy rainfall storage capacity per unit leaf area (mm)
 * fER0   : 
set:
13 (Urban and Built-Up)           = 5  (mixed forest)
16 (Barren or Sparsely Vegetated) = 10 (grassland)
 */
var Alpha_raw = ee.List([0.000, 0.041, 0.048, 0.041, 0.029, 0.029,
    0.029, 0.029, 0.044, 0.029, 0.034, 0.026,
    0.029, 0.029, 0.029, 0.000, 0.034, 0.000]);
var Thelta_raw = ee.List([0.000, 0.069, 0.024, 0.069, 0.022, 0.036,
    0.063, 0.063, 0.035, 0.036, 0.027, 0.038,
    0.069, 0.036, 0.069, 0.000, 0.027, 0.000]);
var m_raw = ee.List([0.000, 8.316, 10.602, 8.316, 10.930, 8.539,
    6.320, 6.320, 6.500, 9.031, 6.250, 25.755,
    8.404, 8.539, 8.404, 0.000, 6.250, 0.000]);
var Am_25_raw = ee.List([0.000, 13.133, 13.875, 13.133, 10.805, 15.930,
    12.812, 12.812, 13.000, 15.809, 46.375, 16.070,
    20.181, 15.930, 20.181, 0.000, 46.375, 0.000]);
var D0_raw = ee.List([0.700, 0.501, 0.536, 0.501, 0.552, 0.501,
    0.575, 0.575, 0.747, 0.809, 0.544, 2.000,
    0.696, 0.501, 0.696, 0.700, 0.544, 0.700]);
var kQ_raw = ee.List([0.600, 0.914, 0.832, 0.914, 0.480, 0.593,
    0.691, 0.691, 0.753, 1.000, 0.722, 0.644,
    0.100, 0.593, 0.100, 0.600, 0.722, 0.600]);
var kA_raw = ee.List([0.700, 0.899, 0.899, 0.899, 0.895, 0.680,
    0.895, 0.895, 0.848, 0.895, 0.895, 0.899,
    0.899, 0.680, 0.899, 0.700, 0.895, 0.700]);
var S_sls_raw = ee.List([0.000, 0.123, 0.098, 0.123, 0.069, 0.131,
    0.014, 0.014, 0.174, 0.049, 0.114, 0.010,
    0.010, 0.131, 0.010, 0.000, 0.114, 0.000]);
var fER0_raw = ee.List([0.000, 0.055, 0.085, 0.055, 0.010, 0.010,
    0.010, 0.010, 0.109, 0.055, 0.023, 0.010,
    0.158, 0.010, 0.158, 0.000, 0.023, 0.000]);
var VPDmin_raw = ee.List([1.000, 0.657, 0.664, 0.657, 0.664, 0.657,
    1.492, 1.492, 0.664, 1.032, 0.664, 1.399,
    1.213, 0.657, 1.213, 1.000, 0.664, 1.000]);
var VPDmax_raw = ee.List([4.000, 6.203, 4.570, 6.203, 6.305, 3.500,
    4.086, 4.086, 3.938, 3.695, 3.625, 6.500,
    3.500, 3.500, 3.500, 4.000, 3.625, 4.000]);

/** LAIref (reference leaf area index), setting as 5 */
/** Maximum stomtal conductance in a unite m/s, make sure Ga/Gc ~= 0 */
var gsx_raw = ee.List([50.00, 3.2, 3.8, 3.2, 4.3, 3.1,
    2.4, 2.4, 1.9, 3.7, 2.3, 16.3,
    5.2, 5.00, 5.2, 50.00, 0.50, 4.00]) // update 26 Feb, 2018
    .map(function (x) { return ee.Number(x).multiply(1e-3) });

/** canopy height */
var hc_raw = ee.List([0.01, 10, 10, 10, 10, 10,
    1, 1, 5, 5, 0.2, 1,
    0.5, 10, 1, 0.01, 0.05, 0.1]); //update 15 Feb, 2018

/**
 * Construct parameters depend on landcover type
 *
 * @param  {ee.Image} landcover [description]
 * @param  {ee.List}  list      [description]
 * @return {ee.Image}           [description]
 */
function propertyByLand_v2(landcover, list) {
    landcover = ee.Image(landcover);
    // modis landcover 18 types
    var lands = ee.List.sequence(0, 17).map(function (i) {
        i = ee.Number(i);
        var land = landcover.eq(i).float();
        var prop = ee.Number(list.get(i));
        return land.multiply(prop);
    });
    return ee.ImageCollection(lands).sum();
}

pkg_PML.init_param_year = function(year, is_PMLV2) {
    if (is_PMLV2 === undefined) is_PMLV2 = true;
    
    var year_land = year;
    if (year >= 2018) year_land = 2018;
    if (year <= 2001) year_land = 2001;

    var filter_date_land = ee.Filter.calendarRange(year_land, year_land, 'year');
    var land = ee.Image(pkg_PML.imgcol_land.filter(filter_date_land).first());
    /** remove water, snow and ice, and unclassified land cover using updateMask */
    // var mask     = land.expression('b() != 0 && b() != 15 && b() != 17');
    // land         = land.updateMask(mask);
    // var landmask = ee.Image(1).updateMask(mask);
    
    // check those parameters into 
    // gsx, hc, LAIref, S_sls can be accessed by `PML_daily`, in its parent env
    var gsx = propertyByLand_v2(land, gsx_raw),    //only for PML_v1
        hc = propertyByLand_v2(land, hc_raw);
    
    // parameters for Ei
    var LAIref = ee.Image(5), //propertyByLand_v2(land, LAIref_raw),
        S_sls = propertyByLand_v2(land, S_sls_raw),
        fER0 = propertyByLand_v2(land, fER0_raw);
        
    var ans = ee.Image([gsx, hc, LAIref, S_sls, fER0]).rename(['gsx', 'hc', 'LAIref', 'S_sls', 'fER0']);
        
    if (is_PMLV2) {
        var Alpha  = propertyByLand_v2(land, Alpha_raw),
            Thelta = propertyByLand_v2(land, Thelta_raw),
            m  = propertyByLand_v2(land, m_raw),
            Am = propertyByLand_v2(land, Am_25_raw);
        // Ca      = 380; //umol mol-1
        D0 = propertyByLand_v2(land, D0_raw);
        kQ = propertyByLand_v2(land, kQ_raw);
        kA = propertyByLand_v2(land, kA_raw);
        var VPDmin = propertyByLand_v2(land, VPDmin_raw);
        var VPDmax = propertyByLand_v2(land, VPDmax_raw);
        // VPDmin = 0.93; VPDmax = 4.3;
        // for PML_v1 D0, kQ, kA are constant parameters.
        ans = ans.addBands(
          ee.Image([Alpha, Thelta, m, Am, D0, kQ, kA, VPDmax, VPDmin])
            .rename(['Alpha', 'Thelta', 'm', 'Am', 'D0', 'kQ', 'kA', 'VPDmax', 'VPDmin']));
    } else {
        /** PML_v1 parameters for Gc */
        kQ  = 0.4488,  // extinction coefficient
        kA  = 0.7,     // the attenuation of net all-wave irradicance, typically about 0.6-0.8 (Denmend, 1976, Kelliher FM et al., (1995))
        Q50 = 30,      // the value of absorbed PAR when gs=gsx/2, W/m2
        D0  = 0.7;     // the value of VPD when stomtal conductance is reduced  kpa 
        ans = ans.addBands(ee.Image([kQ, kA, Q50, D0]).rename(['kQ', 'kA', 'Q50', 'D0']));
    }
    
    var date = ee.Date.fromYMD(year, 1, 1);
    return ans
        .set('system:time_start', date.millis())
        .set('system:id', date.format('yyyy-MM-dd'))
        .set('Year', ee.Number(year).format());
};

pkg_PML.init_param_years = function(is_PMLV2){
    if (is_PMLV2 === undefined) is_PMLV2 = true;
    var years = seq(2000, 2019);
    var imgcol_param = years.map(function(year) {return pkg_PML.init_param_year(year, is_PMLV2)});
    imgcol_param = ee.ImageCollection(imgcol_param);
    // Map.addLayer(imgcol_param, {}, 'imgcol_param');
    print(imgcol_param);
};


/** Vapor Pressure in kPa with temperature in degC */
pkg_PML.vapor_pressure = function(t) {
    return t.expression('0.6108 * exp(17.27 * b() / (b() + 237.3))');
};

exports = pkg_main;

var debug = false; //false;
if (debug) {
    pkg_PML.init_param_years(false);  
}
