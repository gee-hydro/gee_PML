/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var point = /* color: #d63000 */ee.Geometry.Point([-118.01513671875, 38.11727165830543]),
    ImgCol_gldas = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/GLDAS_v21_8day"),
    co2 = ee.FeatureCollection("ft:1trgP0M8MslxSolLNQFY-utpFlC2a14ySSFaZegy5"),
    imgcol_albedo = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/Albedo_interp_8d_v2"),
    imgcol_emiss = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/Emiss_interp_8d"),
    imgcol_lai_4d = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/LAI_whit_4d"),
    imgcol_land = ee.ImageCollection("MODIS/006/MCD12Q1");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
/**
 * PML_V2 (Penman-Monteith-Leuning) model 
 * 
 * @reference
 * 1. Gan, R., Zhang, Y., Shi, H., Yang, Y., Eamus, D., Cheng, L., Chiew, F.H.S., 
 *     Yu, Q., 2018. Use of satellite leaf area index estimating evapotranspiration 
 *     and gross assimilation for Australian ecosystems. Ecohydrology e1974. 
 *     https://doi.org/10.1002/eco.1974
 * 2. Zhang, Y., Peña-Arancibia, J.L., McVicar, T.R., Chiew, F.H.S., Vaze, J., 
 *     Liu, C., Lu, X., Zheng, H., Wang, Y., Liu, Y.Y., Miralles, D.G., Pan, M. (2016), 
 *     Multi-decadal trends in global terrestrial evapotranspiration and its 
 *     components. Scientific Reports, 6(1).
 * 3. Zhang, Y., R. Leuning, L. B. Hutley, J. Beringer, I. McHugh, and J. P. Walker (2010), 
 *     Using long‐term water balances to parameterize surface conductances and 
 *     calculate evaporation at 0.05° spatial resolution, Water Resour. Res., 
 *     46, W05512, doi:10.1029/2009WR008716.
 * 4. Leuning, R., Y. Q. Zhang, A. Rajaud, H. Cleugh, and K. Tu (2008), 
 *     A simple surface conductance model to estimate regional evaporation using 
 *     MODIS leaf area index and the Penman-Monteith equation, Water Resour. Res., 
 *     44, W10419, doi:10.1029/2007WR006562.
 *
 * @usage:
 * var pkg_PML = require('users/kongdd/pkgs:Math/PML_v2.js');
 * 
 * Dongdong Kong; 30 April, 2018
 * 
 * Update 09 Sep, 2018
 * -------------------
 * 1. Add trend inspection module
 * 
 */ 


/** LOAD REQUIRED PACKAGES */
var pkg_mov    = require('users/kongdd/public:Math/pkg_movmean.js'); //movmean
var pkg_join   = require('users/kongdd/public:pkg_join.js');
var pkg_main   = require('users/kongdd/public:pkg_main.js');
var pkg_trend  = require('users/kongdd/public:Math/pkg_trend.js');
var pkg_export = require('users/kongdd/public:pkg_export.js');
// var points     = require('users/kongdd/public:data/flux_points.js').points;

var prj = pkg_export.getProj(imgcol_land);

var I_interp    = true;
// `meth_interp` is used to resample meteometeorological forcing into high-resolution
// not suggest 'biculic'. bicubic can't constrain values in reasonable boundary.
var meth_interp = 'bilinear'; // or 'bicubic'
var filter_date_all = ee.Filter.date('2002-07-01', '2017-12-31');

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

/** fix MCD12Q1_006 land cover code. */
var ImgCol_land = imgcol_land.select(0).map(function(land){
    //for MCD12Q1_006 water and unc type is inverse
    land = land.remap([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17], 
        [17, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 0]); 
    return(land);
});

// var land = ee.Image(ImgCol_land.first());
// Map.addLayer(land);

var mean_albedo = imgcol_albedo.select(0).mean().multiply(0.001), // multiple year mean
    mean_emiss  = imgcol_emiss.select(0).mean().expression('b() * 0.002 + 0.49'); // multiple year mean
var land_mask   = mean_emiss.mask(); // mask lead to export error, unknow reason

/** 1.1 GLDAS and CO2 */
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
    .filter(filter_date_all);
ImgCol_gldas = ImgCol_gldas.filter(filter_date_all);
ImgCol_gldas = pkg_join.SaveBest(ImgCol_gldas, ImgCol_co2);

/** 1.2 MODIS products: LAI, Albedo, Emissivity  */
function print_1th(imgcol){
    var img = ee.Image(imgcol.first());
    print(img);
}

if (I_interp){
    var imgcol_lai = ee.ImageCollection( imgcol_lai_4d.toList(10).map(function(img){
        return pkg_main.bandsToImgCol(img, 'LAI');
    }).flatten() )
        .map(function(img){ return img.multiply(0.1).copyProperties(img, img.propertyNames());}); //scale factor 0.1
    imgcol_lai   = ee.ImageCollection(imgcol_lai.toList(2000));

    imgcol_emiss = ee.ImageCollection(imgcol_emiss.toList(1000))
        .map(function(img) {
            var emiss = img.select(0).expression('b() * 0.002 + 0.49'); //.toUint8()
            return img.select('qc').addBands(emiss);
        }).select([1, 0], ['Emiss', 'qc']);

    imgcol_albedo = ee.ImageCollection(imgcol_albedo.toList(1000))
        .map(function(img) {
            var albedo = img.select(0).multiply(0.001);
            return img.select(1).addBands(albedo);
        }).select([1, 0], ['Albedo', 'qc']);//scale factor 0.001, no units;
    
    // print('Interped');
    // print_1th(imgcol_lai);
    // print_1th(imgcol_emiss);
    // print_1th(imgcol_albedo);
} else {
    /** No Interpolation MODIS INPUTS */
    imgcol_lai = ee.ImageCollection('MODIS/006/MCD15A3H').select('Lai')
            .map(function(img){ return img.multiply(0.1).copyProperties(img, img.propertyNames());}); //scale factor 0.1

    imgcol_emiss = ee.ImageCollection('MODIS/006/MOD11A2')
        .select(['Emis_31', 'Emis_32'])
        .map(function(img) {
            return img.reduce(ee.Reducer.mean()).multiply(0.002).add(0.49)
                .copyProperties(img, ['system:time_start', 'system:id']);
        }).select([0], ['Emiss']);

    var Albedo_raw = ee.ImageCollection('MODIS/006/MCD43A3').select(['Albedo_WSA_shortwave'])
            .map(pkg_trend.add_dn(true));
    imgcol_albedo = pkg_trend.aggregate_prop(Albedo_raw, 'd8', 'mean')
        .map(function(img) {return img.addBands(img.multiply(0.001)).select([1]);})
        .select([0], ['Albedo']);
    
    // print('No Interped');
    // print_1th(imgcol_lai);
    // print_1th(imgcol_emiss);
    // print_1th(imgcol_albedo);
}

/**
 * Prepare INPUT datset for PML_V2
 *
 * @param {[type]} begin_year [description]
 * @param {[type]} end_year   [description]
 */
function PML_INPUTS_d8(begin_year, end_year){
    if (typeof end_year === 'undefined') { end_year = begin_year; }
    begin_year = ee.Number(begin_year);
    end_year   = ee.Number(end_year);
    
    var begin_yearStr = begin_year.format('%d'), 
        end_yearStr   = end_year.format('%d');
    var date_begin = ee.Date(ee.Algorithms.If(begin_year.eq(ee.Number(2002)),
            begin_yearStr.cat("-07-01"), begin_yearStr.cat("-01-01"))),
        date_end    = ee.Date(end_yearStr.cat("-12-31"));
    var filter_date = ee.Filter.date(date_begin, date_end);
    // print(date_begin, date_end);
    
    /** MODIS LAI, Albedo, Emiss */
    // var miss_date = ee.Date('2003-12-19'); //replaced with 2003-12-23
    // var lai_miss  = imgcol_lai.filterDate('2003-12-22', '2003-12-24')
    //     .map(function(img){ return pkg_main.setImgProperties(img, miss_date); })
    //     .sort("system:time_start");
    
    var LAI_d4  = imgcol_lai.filter(filter_date);//.merge(lai_miss);
    LAI_d4      = LAI_d4.map(pkg_trend.add_dn(true, 8));
    
    var LAI_d8 = pkg_trend.aggregate_prop(LAI_d4, 'dn', 'mean').select([0], ['LAI']);
    // print(LAI_d4, LAI_d8, 'LAI_d8');
    
    LAI_d8 = LAI_d8.map(function(img){
        return img.updateMask(img.gte(0)).unmask(0); //.mask(land_mask); // LAI[LAI < 0] <- 0
    });
    
    // LAI has missing images, need to fix in the future
    
    var Albedo_d8 = imgcol_albedo.filter(filter_date);
    var Emiss_d8  = imgcol_emiss.filter(filter_date);
        
    var modis_input = pkg_join.SaveBest(Emiss_d8, LAI_d8);
    modis_input     = pkg_join.SaveBest(modis_input, Albedo_d8);
    
    // print(modis_input);
    if (I_interp){
        // add qc bands
        modis_input = modis_input.map(function(img){
            var qc = img.expression('b("qc") + b("qc_1")*8').toUint8(); //qc, 0-2:emiss, 3-5:albedo
            return img.select(['LAI', 'Emiss', 'Albedo']).addBands(qc);
        });    
    }
    
    var gldas_input = ImgCol_gldas.filter(filter_date);
    if (meth_interp === 'bilinear' || meth_intterp === 'bicubic'){
        gldas_input = gldas_input.map(function(img){
            return img.resample(meth_interp).copyProperties(img, img.propertyNames());
        });
    }
    
    var pml_input   = pkg_join.InnerJoin(modis_input, gldas_input).sort("system:time_start");
    // Map.addLayer(pml_input, {}, 'pml_input');
    // Map.addLayer(modis_input, {}, 'modis_input');
    return ee.ImageCollection(pml_input);
}

/** PML GLOBAL PARAMETERS */
var Gsc         = 0.0820,  // solar constant in unit MJ m-2 min-1,
    as          = 0.25,    // parameter Rs/Ra=as+bs*n/N; calibration from our solar radiation measurement
    bs          = 0.50,    // parameter Rs/Ra=as+bs*n/N;
    alfa        = 0.23,    // surface albedo of grass
    alfa_forest = 0.22,    // surface albedo of forest
    alfa_crop   = 0.14,    // surface albedo of crop

    kmar   = 0.40,    // von Karman's constant 0.40 
    Zob    = 15,      // m, making sure higher than hc
    Cp     = 1.0164,  // 4.2 * 0.242, specific heat at constant pressure, 1.013  [J g-1 0C-1]
    epsl   = 0.622,   // ratio molecular weight of water vapour/dry air

    /** PML_v1 parameters for Gc */
    kQ     = 0.4488,  // extinction coefficient
    kA     = 0.7,     // the attenuation of net all-wave irradicance, typically about 0.6-0.8 (Denmend, 1976, Kelliher FM et al., (1995))
    Q50    = 30,      // the value of absorbed PAR when gs=gsx/2, W/m2
    D0     = 0.7;     // the value of VPD when stomtal conductance is reduced  kpa 

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
    .map(function(x) { return ee.Number(x).multiply(1e-3) });
    
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
    var lands = ee.List.sequence(0, 17).map(function(i) {
        i = ee.Number(i);
        var land = landcover.eq(i).float();
        var prop = ee.Number(list.get(i));
        return land.multiply(prop);
    });
    return ee.ImageCollection(lands).sum();
}

/** Vapor Pressure in kPa with temperature in degC */
function vapor_pressure(t) {
    return t.expression('0.6108 * exp(17.27 * b() / (b() + 237.3))');
}

/**P
 * PML_V2 (Penman-Monteith-Leuning) model
 *
 * sub functions:
 *     -- PML_daily(img)
 *     `PML_daily` has all the access of yearly land cover based parameters 
 *     (e.g. gsx, hc, LAIref, S_sls). 
 *     
 * 
 *     -- PML_year(INPUTS)
 *     
 * @param {Integer} year Used to filter landcover data and set landcover depend parameters.
 * @param {boolean} is_PMLV2 Default is true, and PML_V2 will be used. If false, 
 *                     PML_V1 will be used.
 * 
 * @return {ee.ImageCollection} An ImageCollection with the bands of 
 *                                 ['GPP', 'Ec', 'Es', 'Ei', 'ET_water','qc'] for PML_V2;
 *                                 ['Ec', 'Es', 'Ei', 'ET_water','qc'] for PML_V1;
 */
function PML(year, is_PMLV2) {
    // fix landcover time range after 2013, 2014-2016
    year         = ee.Number(year);
    var year_max = 2016, 
        year_min = 2001;
    var year_land = ee.Algorithms.If(year.gt(year_max), year_max, 
            ee.Algorithms.If(year.lt(year_min), year_min, year));
  
    var filter_date_land = ee.Filter.calendarRange(year_land, year_land, 'year');
    var land = ee.Image(ImgCol_land.filter(filter_date_land).first()); //land_raw was MODIS/051/MCD12Q1
    
    /** remove water, snow and ice, and unclassified land cover using updateMask */
    // var mask     = land.expression('b() != 0 && b() != 15 && b() != 17');
    // land         = land.updateMask(mask);
    // var landmask = ee.Image(1).updateMask(mask);
    
    /** Initial parameters */
    // gsx, hc, LAIref, S_sls can be accessed by `PML_daily`, in its parent env
    var gsx     = propertyByLand_v2(land, gsx_raw),    //only for PML_v1
        hc      = propertyByLand_v2(land, hc_raw);
        
    if (is_PMLV2){
        var Alpha   = propertyByLand_v2(land, Alpha_raw),
            Thelta  = propertyByLand_v2(land, Thelta_raw),
            m       = propertyByLand_v2(land, m_raw),
            Am      = propertyByLand_v2(land, Am_25_raw);
            // Ca      = 380; //umol mol-1
        D0      = propertyByLand_v2(land, D0_raw);
        kQ      = propertyByLand_v2(land, kQ_raw);
        kA      = propertyByLand_v2(land, kA_raw);
        var VPDmin  = propertyByLand_v2(land, VPDmin_raw);
        var VPDmax  = propertyByLand_v2(land, VPDmax_raw);
        
        // VPDmin = 0.93; VPDmax = 4.3;
        // for PML_v1 D0, kQ, kA are constant parameters.
    }
    // parameters for Ei
    var LAIref  = ee.Image(5), //propertyByLand_v2(land, LAIref_raw),
        S_sls   = propertyByLand_v2(land, S_sls_raw),
        fER0    = propertyByLand_v2(land, fER0_raw);

    /**
     * Calculate daily PML GPP and ET using GLDAS and MODIS inputs.
     * 
     * @param  {Image} img GLDAS meteorological forcing data and MODIS remote sensing data
     *    with bands: ['LAI', 'Emiss', 'Albedo', 'Pa', 'Tmax', 'Tmin', 'Tavg', 'Prcp', 'Rln', 'Rs', 'U2']
     * 
     * @return {Image} PML_ET with bands of ['ET_water', 'Es_eq', 'Ec', 'Ei', 'Pi']; 
     *                 If v2 = true, GPP also will be returned.
     */
    function PML_daily(img) {
        img = ee.Image(img);
        var Ca     = img.select('co2');   //umol mol-1
        var q      = img.select('q');     // kg/kg;
        var p      = img.select('Pa');    // kPa
        var u2     = img.select('U2');    // m/s
        
        var Tmax   = img.select('Tmax');  // degC
        var Tmin   = img.select('Tmin');  // degC
        var Tavg   = img.select('Tavg');  // degC
        
        var Rln    = img.select('Rln');   // W/m2/s, not MJ/m2/d 
        var Rs     = img.select('Rs');    // W/m2/s
        
        var albedo = img.select('Albedo');// %
        var emiss  = img.select('Emiss'); // %
        var LAI    = img.select('LAI');   // 0 - 
        
        var lambda = 2500; // latent heat of vaporization, 2500 [J g-1]  at 25 degC
        lambda     = Tavg.multiply(-2.2).add(lambda);
        /** 
         * ACTUAL VAPOUR PRESSURE
         * https://www.eol.ucar.edu/projects/ceop/dm/documents/refdata_report/eqns.html, Eq-17
         */
        var ea = img.expression('q * p / (0.622 + 0.378 * q)', { 'p': p, 'q': q });

        // saturation vapour pressure from Tair
        var es_tmax = vapor_pressure(Tmax);
        var es_tmin = vapor_pressure(Tmin);
        var es_tavg = vapor_pressure(Tavg);
        var es      = es_tmax.add(es_tmin).divide(2);

        var VPD = es.subtract(ea).max(0.001);

        var rou_a = img.expression('3846 * Pa / (Tavg + 273.15)', 
            { 'Pa': p, 'Tavg': Tavg });
        var gama = img.expression('Cp*Pa/(0.622*lambda)', 
            { Cp: Cp, Pa: p, lambda: lambda }); // kpa/0C
        var slop = img.expression('4098 * es / pow(Tavg + 237.3, 2)', 
            { 'es': es_tavg, 'Tavg': Tavg });

        // downward Solar Radiation
        var Stefan = 4.903e-9;// Stefan-Boltzmann constant [MJ K-4 m-2 day-1],
        var Rns   = ee.Image(1).subtract(albedo).multiply(Rs);
        var RLout = img.expression('Emiss * Stefan * pow(Tavg+273.15, 4)', 
            { 'Emiss': emiss, Stefan: Stefan, Tavg: Tavg }).divide(0.0864);
        var Rnl     = Rln.subtract(RLout);
        var Rn      = Rns.add(Rnl).max(0.0);    // to ensure Rn >= 0;
        var PAR     = Rs.multiply(0.45).max(0); // could be used modis data to replace
        // units convert: http://www.egc.com/useful_info_lighting.php
        
        var Gc, GPP;
        var fvpd_gc = VPD.expression('1/(1+b()/D0)', {D0:D0});        // leuning
        // var fvpd = VPD.expression('exp(-D0 * pow(b(), 2))', {D0:D0}); // yongqiang, f_VPD = exp(-D0 * VPD.^2);
        // var VPD_sqrt = VPD.sqrt();
        // var fvpd = VPD_sqrt.expression('b()*(b() < 1) + 1/b()*(b() >= 1)');
        var fvpd = VPD.expression('(VPDmax - b())/(VPDmax - VPDmin)', {VPDmin:VPDmin, VPDmax:VPDmax})
            .min(1.0).max(0.0); 

        if (is_PMLV2){
            var PAR_mol = PAR.multiply(4.57);    // from [W m-2] to [umol m-2 s-1]

            /** G flux part */
            var fT2 = Tavg.expression('exp(0.031*(b()-25))/(1 +exp(0.115*(b()-41)))').min(1.0);
            
            var P1  = Am.multiply(Alpha).multiply(Thelta).multiply(PAR_mol),
                P2  = Am.multiply(Alpha).multiply(PAR_mol),
                P3  = Am.multiply(Thelta).multiply(Ca),
                P4  = Alpha.multiply(Thelta).multiply(PAR_mol).multiply(Ca).divide(fT2);
            
            var Ags  = P1.expression('Ca*P1/(P2*kQ + P4*kQ) * (kQ*LAI + log((P2+P3+P4)/(P2+P3*exp(kQ*LAI) + P4)))', //*fT2
                {Ca:Ca, P1:P1, P2:P2, P3:P3, P4:P4, kQ:kQ, LAI:LAI, fT2:fT2});  // umol cm-2 s-1
            GPP  = Ags.multiply(1.0368).multiply(fvpd).rename('GPP'); //86400/1e6*12
            
            var img_check = GPP.addBands([rou_a, gama, slop, PAR, PAR_mol, fT2, P1, P2, P3, P4])
                .rename(['gpp', 'rou_a', 'gama', 'slop', 'par', 'par_mol', 'fT2', 'p1', 'p2', 'p3', 'p4']);
            
            Gc = m.expression('m/Ca*Ags*1.6*fvpd_gc', {m:m, Ca:Ca, Ags:Ags, fvpd_gc:fvpd_gc});
            // Convert from mol m-2 s-1 to cm s-1 to m s-1
            Gc = Gc.expression('Gc*1e-2/(0.446*(273/(273+Tavg))*(Pa/101.3))', 
                {Gc:Gc, Tavg:Tavg, Pa:p}); // unit convert to m s-1
        }else{
            // Conductance and ET component
            Gc = LAI.expression('gsx/kQ*log((PAR+Q50)/(PAR*exp(-kQ*LAI)+Q50))*fvpd_gc', 
                { gsx: gsx, kQ: kQ, PAR: PAR, Q50: Q50, LAI: LAI, fvpd_gc:fvpd_gc }); 
        }
        Gc = Gc.max(1e-6); 
        // known bug: bare, ice & snow, unc, all zero parameters will lead to p1, p2, p3, p4 = 0,
        //            GPP = 0/0(masked), and Ec = masked.
        
        /** AERODYNAMIC CONDUCTANCE */
        var d   = hc.multiply(0.64);
        var zom = hc.multiply(0.13);
        var zoh = zom.multiply(0.1);
        var uz  = img.expression('log(67.8*Zob - 5.42)/4.87 * u2', 
            { Zob: Zob, u2: u2 });
        var Ga  = img.expression('uz*kmar*kmar / (log((Zob-d)/zom) * log((Zob-d)/zoh))', 
            { uz: uz, kmar: kmar, Zob: Zob, zom: zom, zoh: zoh, d: d });

        // Equilibrium evaporation
        var Eeq = img.expression('slop/(slop+gama)*Rn', { slop: slop, gama: gama, Rn: Rn })
            .divide(lambda).multiply(86.4) // convert W/m2/s into mm
            .max(0.0001); 
        // Penman Monteith potential ET
        var Evp = VPD.expression('(gama/(slop+gama))*((6430 * (1 + 0.536*u2) * VPD)/lambda)', 
            { slop: slop, gama: gama, u2: u2, VPD: VPD, lambda: lambda })
            .max(0);
        var mask_water = land.expression('b() == 0 || b() == 15'); //water, snow&ice
        var ET_water   = Eeq.add(Evp).updateMask(mask_water).rename('ET_water');

        // // Convert MJ/m2/day into W/m2;
        // Rn  = Rn.divide(0.0864).max(0);
        // PAR = PAR.divide(0.0864).max(0);
        
        // Conductance and ET component
        var Tou = LAI.expression('exp(-kA*LAI)', { kA: kA, LAI: LAI });

        // % Transpiration from plant cause by radiation water transfer
        var LEcr = slop.expression('slop/gama*Rn *(1 - Tou)/(slop/gama + 1 + Ga/Gc)', 
            { slop: slop, gama: gama, Rn: Rn, Tou: Tou, Ga: Ga, Gc: Gc });               // W/m2
        // var LEcr = landmask.* LEcr;

        // % Transpiration from plant cause by aerodynamic water transfer
        var LEca = slop.expression('(rou_a * Cp * Ga * VPD / gama)/(slop/gama + 1 + Ga/Gc)', 
            { rou_a: rou_a, Cp: Cp, Ga: Ga, Gc: Gc, VPD: VPD, gama: gama, slop: slop }); // W/m2

        // % making sure vegetation transpiration is negaligable, this is very important for very dry Sahara
        // Should take it seriously. LAI = 0, will lead to a extremely large value. 
        // Update 24 Aug'2017, kongdd
        LEca = LEca.where(LAI.lte(0.0), 0.0);
        LEcr = LEcr.where(LAI.lte(0.0), 0.0);
        var LEc = LEca.add(LEcr);
        
        // % Soil evaporation at equilibrium
        var LEs_eq = slop.expression('(slop/gama)* Rn *Tou/(slop/gama + 1)', 
            { slop: slop, gama: gama, Rn: Rn, Tou: Tou });

        /** W/m2 change to mm d -1 */
        var coef_MJ2mm = lambda.divide(86.4); // ET./lambda*86400*10^-3;
        var Es_eq = LEs_eq.divide(coef_MJ2mm);
        var Ecr   = LEcr.divide(coef_MJ2mm);
        var Eca   = LEca.divide(coef_MJ2mm);
        var Ec    = LEc.divide(coef_MJ2mm);

        /** 
         * Interception Precipitation Evaporation: prcp_real = prcp - Ei 
         * @references 
         * Van Dijk, A.I.J.M. and Warren, G., 2010. The Australian water resources assessment system. Version 0.5, 3(5). P39
         */
        var prcp = img.select('Prcp');
        var fveg = LAI.expression('1 - exp(-LAI/LAIref)', { LAI: LAI, LAIref: LAIref });
        var Sveg = S_sls.multiply(LAI);
        
        var fER  = fveg.multiply(fER0);
        var prcp_wet = LAI.expression('-log(1 - fER0) / fER0 * Sveg / fveg', 
            { fER0: fER0, fveg: fveg, Sveg: Sveg });
        var Ei = LAI.expression('(P < Pwet) * fveg * P + (P >= Pwet) * ( fveg*Pwet + fER*(P - Pwet) )', 
            { fveg: fveg, fER: fER, P: prcp, Pwet: prcp_wet });
        var Pi = prcp.subtract(Ei);
        // (P < Pwet) * fveg * P + (P >= Pwet) * ( fveg*Pwet + fER*(P - Pwet) )
        //    NA and infinite values should be replaced as zero. But GEE where and 
        //    updatemask are incompetent.
        // ----------------------------------------------------------------------
        
        // var newBands = ['ETsim', 'Es', 'Eca', 'Ecr', 'Ei', 'Eeq', 'Evp', 'Es_eq'];
        var newBands = ['Es_eq', 'Ec', 'Ei', 'Pi']; //'Eeq', 'Evp', 'ETsim', 'Es'
        var newImg = ee.Image([Es_eq, Ec, Ei, Pi]).rename(newBands);
        if (is_PMLV2) newImg = newImg.addBands(GPP); //PML_V2
        
        newImg = newImg.updateMask(mask_water.not()).addBands(ET_water); //add ET_water
        // Comment 2018-09-05, to get yearly sum, it can be converted to uint16
        // otherwise, it will be out of range.
        // newImg = newImg.multiply(1e2).toUint16(); //CONVERT INTO UINT16 
        
        if (I_interp){
            var qc = img.select('qc');  
            newImg = newImg.addBands(qc);
        }
        
        var beginDate = ee.Date(img.get('system:time_start'));
        return pkg_main.setImgProperties(newImg, beginDate);
        // return pkg_main.setImgProperties(img_check, beginDate);
    }

    /**
     * Calculate a period PML
     *
     * @param {ee.ImageCollection} INPUTS Multibands ImageCollection returned 
     * by PML_INPUTS_d8
     */
    function PML_period(INPUTS){
        var len = INPUTS.size();
        /** 2. ImgsRaw: ['Eeq', 'Evp', 'Es_eq', 'Eca', 'Ecr', 'Ei', 'Pi'] */
        var PML_ImgsRaw = INPUTS.map(PML_daily).sort("system:time_start");

        /** 3. Calculate fval_soil, and add Es band */
        var frame = 3; // backward moving average
        var Pi_Es = PML_ImgsRaw.select(['Pi', 'Es_eq']);
        /** movmean_lst(ImgCol, n, win_back = 0, win_forward = 0) */
        var ImgCol_mov = pkg_mov.movmean_lst(Pi_Es, len, frame);
        var fval_soil = ImgCol_mov.map(function(img) {
            return img.expression('b("Pi") / b("Es_eq")').min(1.0).max(0.0)
                .copyProperties(img, pkg_main.global_prop);
        }).select([0], ['fval_soil']);

        /** 4. calculate Es */
        var PML_Imgs_0 = pkg_join.SaveBest(PML_ImgsRaw, fval_soil); //.sort('system:time_start'); 
        var PML_Imgs = PML_Imgs_0.map(function(img) {
            var Es = img.expression('b("Es_eq") * b("fval_soil")').rename('Es'); //.toUint16()
            // var ET = img.expression('b("Ec") + b("Ei") + Es', { Es: Es }).rename('ET');
            return img.addBands(Es); //ET
        }).select(bands); //, 'ET_water'
        
        // Map.addLayer(INPUTS, {}, 'INPUTS');
        // Map.addLayer(PML_ImgsRaw.select('Ec'), {}, 'Ec');
        // Map.addLayer(PML_Imgs, {}, 'PML_Imgs');
        // Map.addLayer(ImgCol_land, {}, 'land')
        return PML_Imgs;
    }

    function Export(){
        /** Export ImgCol into asset */
        var save = true;
        if (save){
          var dates = ee.List(INPUTS.aggregate_array('system:time_start'))
            .map(function(date) { return ee.Date(date).format('yyyy-MM-dd'); }); //.getInfo(); //DATES of INPUT
        
            // print('hello', PML_Imgs, dates);
            var img = ee.Image(PML_Imgs.first());
            // img = img.select(ee.List.sequence(0, 4)); //rm qc band
            // var crs_trans = img.select('qc').projection().transform();
            // img = img.reproject(crs, crs_trans);
            
            // print(img, crs_trans);
            // Map.addLayer(img);
            // Map.addLayer(PML_Imgs, {}, 'PML_Imgs')
            // print(PML_Imgs, dates);
            
            // export_image(img, '2002-07-05_v6');
            pkg_export.ExportImgCol(PML_Imgs, dates, range, scale, type, folder, crs);
            // pkg_export.ExportImg_deg(img, range, '2002-07-05_v4', scale, drive, folder, crs)
        }else{
            print('PML_Imgs', PML_Imgs);    
        }
    }
    
    var INPUTS = PML_INPUTS_d8(year);
    // Map.addLayer(INPUTS, {}, 'INPUT');
    
    var PML_Imgs = PML_period(INPUTS);
    // Export();
    return PML_Imgs;
}

var exec = true;
var range     = [-180, -60, 180, 90],
    bounds    = ee.Geometry.Rectangle(range, 'EPSG:4326', false), //[xmin, ymin, xmax, ymax]
    cellsize  = 1 / 240, //1/240,
    type      = 'asset',
    crs       = 'SR-ORG:6974', //projects/pml_evapotranspiration
    crsTransform = prj.crsTransform;
    
function img_GlobalSum(img, bands, scale){
    bands = bands || img.bandNames();
    scale = scale || 50000;
    /** define reducer */
    // define reduction function (client-side), see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/Reduce
    var combine = function(reducer, prev) { return reducer.combine(prev, null, true); };
    var reducers = [ ee.Reducer.mean(), ee.Reducer.count(), ee.Reducer.stdDev()];
    // var reducer = ee.Reducer.sum();
    // print(reducers.slice(1), 'reducers.slice(1)');
    var reducer = reducers.slice(1).reduce(combine, reducers[0]);
    
    var dict = img.select(bands).reduceRegion({
            reducer: reducer,
            geometry: bounds,
            scale:scale, maxPixels: 1e13, tileScale: 16 });
    
    var fc = ee.FeatureCollection(ee.Feature(null, dict));
    Export.table.toDrive({
            collection: fc, 
            description: 'temp',
            folder: "IGBP", 
            fileFormat: 'GeoJSON'
        });
    return fc;
}

function imgcol_globalSum(){
    Export.table.toDrive({
        collection: x, 
        description: task,
        folder: "IGBP", 
        fileFormat: 'GeoJSON'
    });
}

if (exec) {
    var is_PMLV2 = true; //If false, PML_V1 will be used!
    var bands, folder;
    if (is_PMLV2) {
        bands = ['GPP', 'Ec', 'Es', 'Ei', 'ET_water', 'qc']; //,'qc'
        folder = 'projects/pml_evapotranspiration/PML/OUTPUT/PML_V2_8day';//'projects/pml_evapotranspiration/PML_v2';
    } else {
        bands = ['Ec', 'Es', 'Ei', 'ET_water', 'qc'];
        folder = 'projects/pml_evapotranspiration/PML/OUTPUT/PML_V1_8day';
    }

    var year  = 2003,
        year_begin = 2003, 
        year_end   = year_begin + 4, //year_begin + 3,
        save  = true, //global param called in PML_main
        debug = false;

    var imgcol_PML, img_year;
    var begin_date, ydays;
    
    var years = ee.List.sequence(2003, 2012);
    
    var pkg_vis   = require('users/kongdd/public:pkg_vis.js');
    var vis_et  = {min: 100, max: 1600 , palette:pkg_vis.colors.RdYlBu[11]},
        vis_gpp = {min: 100, max: 3500 , palette:pkg_vis.colors.RdYlGn[11]};
    var vis_slp = {min:-20, max:20, palette:["ff0d01","fafff5","2aff03"]};
    
    var lg_gpp  = pkg_vis.grad_legend(vis_gpp, 'GPP', false); 
    var lg_slp  = pkg_vis.grad_legend(vis_slp, 'Trend (gC m-2 y-2)', false); //gC m-2 y-2, kPa y-1

    pkg_vis.add_lgds([lg_gpp, lg_slp]);

    if (debug) {
        var pkg_trend  = require('users/kongdd/public:Math/pkg_trend.js');
        // year = ee.Number(year);
        // begin_date = ee.Date.fromYMD(year,1,1);
        // ydays = begin_date.advance(1, 'year').difference(begin_date, 'day');
        
        // // print(begin_date, ydays, year)
        
        // imgcol_PML = PML(year, is_PMLV2);
        // img_year = imgcol_PML.select(bands.slice(0, -1)).mean().multiply(ydays)
        //     .set('system:time_start', begin_date.millis())
        //     .set('system:id', begin_date.format('YYYY-MM-dd'));
        
        // print(imgcol_PML)
        // print('imgcol_PML', ydays, imgcol_PML, img_year);
        // check outliers
        // var img = imgcol_PML.first(); //img_year; //
        // var mask = img.select('Ec').expression('b() > 1e5 || b() < 0');
        // Map.addLayer(img_year.select('GPP'), vis_gpp, 'img_year');
        
        var imgcol_year = years.map(function(year){
            year = ee.Number(year);
            var imgcol_PML = PML(year, is_PMLV2);
            
            var begin_date = ee.Date.fromYMD(year,1,1);
            var task = begin_date.format('YYYY-MM-dd'); //.getInfo();
            var ydays = begin_date.advance(1, 'year').difference(begin_date, 'day');
            
            var img_year = imgcol_PML.select(bands.slice(0, -1)).mean().multiply(ydays)
                .set('system:time_start', begin_date.millis())
                .set('system:id', task);
            return img_year;
        });
        
        imgcol_year = ee.ImageCollection(imgcol_year);
        
        var img_trend = pkg_trend.imgcol_trend(imgcol_year, 'GPP', true);
        Map.addLayer(img_trend.select('slope'), vis_slp, 'gpp');
      
        var img = imgcol_year.first(); //img_year; //
        
        var globalSum = img_GlobalSum(img);
        print(img, globalSum, 'globalSum');
        
        var mask = img.expression('b("Ec")+b("Es")+b("Ei")').expression('b() > 1e5 || b() < 0');
        Map.addLayer(img.select('GPP'), vis_gpp, 'first_year GPP');
        
        // print(imgcol_year, img_trend);
        
        task = 'img_trend';
        folder_yearly = 'projects/pml_evapotranspiration/PML/v014';
        type = 'asset';
        pkg_export.ExportImg_deg(img_trend, task, range, cellsize, type, folder_yearly, crs, crsTransform);
        // Map.addLayer(mask, {min:0, max:1, palette: ['white', 'red']}, 'mask');
        
    } else {
        // export parameter for yearly PML
        var folder_yearly = 'projects/pml_evapotranspiration/PML/v012/PML_V2_yearly_v014'; //_bilinear
        var task;
        
        for (var year = year_begin; year <= year_end; year++){
            begin_date = ee.Date.fromYMD(year,1,1);
            task = begin_date.format('YYYY-MM-dd').getInfo();
            
            ydays = begin_date.advance(1, 'year').difference(begin_date, 'day');
            
            imgcol_PML = PML(year, is_PMLV2);
            img_year = imgcol_PML.select(bands.slice(0, -1)).mean().multiply(ydays)
                .set('system:time_start', begin_date.millis())
                .set('system:id', task);
            
            pkg_export.ExportImg_deg(img_year, task, range, cellsize, type, folder_yearly, crs, crsTransform);
            // pkg_export.ExportImgCol(PML_Imgs, dates, range, scale, type, folder, crs);
        }
    }
}

exports = {
    PML: PML
};
