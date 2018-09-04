/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var ImgCol_land = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/MCD12Q1_006"),
    point = /* color: #d63000 */ee.Geometry.Point([-118.01513671875, 38.11727165830543]),
    ImgCol_gldas = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/GLDAS_v21_8day"),
    co2 = ee.FeatureCollection("ft:1trgP0M8MslxSolLNQFY-utpFlC2a14ySSFaZegy5"),
    imgcol_albedo = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/Albedo_interp_8d_v2"),
    imgcol_emiss = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/Emiss_interp_8d"),
    imgcol_lai_4d = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/LAI_whit_4d");
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
 */ 

/** LOAD REQUIRED PACKAGES */
var pkg_mov    = require('users/kongdd/public:Math/pkg_movmean.js'); //movmean
var pkg_join   = require('users/kongdd/public:pkg_join.js');
var pkg_main   = require('users/kongdd/public:pkg_main.js');
var pkg_trend  = require('users/kongdd/public:Math/pkg_trend.js');
var pkg_export = require('users/kongdd/public:pkg_export.js');
// var points     = require('users/kongdd/public:data/flux_points.js').points;

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

var I_interp = true;
var filter_date_all  = ee.Filter.date('2002-07-01', '2017-12-31');
// var crs_trans = [463.3124742983412, 0, -20015098.88968834, 0, -463.31271656938463, 10007554.677898709]; //Interped LAI
var crs_trans = [463.3127165279165, 0, -20015109.353988  , 0, -463.3127165274999 , 10007554.676994   ]; //origin LAI

// var crs_trans     = [926.6249485966824, 0, -20015098.889688343, 0, -926.6254331387692, 10007554.677898707];
    
/** fix MCD12Q1_006 land cover code. */
ImgCol_land = ImgCol_land.map(function(land){
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
    var imgcol_lai = ee.ImageCollection( imgcol_lai_4d.map(pkg_main.bandsToImgCol).flatten() )
        .map(function(img){ return img.addBands(img.multiply(0.1)).select([1]);}); //scale factor 0.1
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
            .map(function(img){ return img.addBands(img.multiply(0.1)).select([1]);}); //scale factor 0.1

    imgcol_emiss = ee.ImageCollection('MODIS/006/MOD11A2')
        .select(['Emis_31', 'Emis_32'])
        .map(function(img) {
            return img.reduce(ee.Reducer.mean()).multiply(0.002).add(0.49)
                .copyProperties(img, ['system:time_start', 'system:id']);
        }).select([0], ['Emiss']);

    var Albedo_raw = ee.ImageCollection('MODIS/006/MCD43A3').select(['Albedo_WSA_shortwave'])
            .map(pkg_trend.add_d8(true));
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
    var date_begin = ee.Date(ee.Algorithms.If(begin_year.eq(2002),
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
    LAI_d4      = LAI_d4.map(pkg_trend.add_d8(true));
    
    var LAI_d8 = pkg_trend.aggregate_prop(LAI_d4, 'd8', 'mean').select([0], ['LAI']);
    LAI_d8 = LAI_d8.map(function(img){
        return img.updateMask(img.gte(0)).unmask(0); //.mask(land_mask); // LAI[LAI < 0] <- 0
    });
    // print(LAI_d4, 'LAI_d4');
    // LAI has missing images, need to fix in the future
    
    var Albedo_d8 = imgcol_albedo.filter(filter_date);
    var Emiss_d8  = imgcol_emiss.filter(filter_date);
        
    var modis_input = pkg_join.SaveBest(Emiss_d8, LAI_d8);
    modis_input     = pkg_join.SaveBest(modis_input, Albedo_d8);
    
    if (I_interp){
        // add qc bands
        modis_input = modis_input.map(function(img){
            var qc = img.expression('b("qc") + b("qc_1")*8').toUint8(); //qc, 0-2:emiss, 3-5:albedo
            return img.select(['LAI', 'Emiss', 'Albedo']).addBands(qc);
        });    
    }
    
    var gldas_input = ImgCol_gldas.filter(filter_date);
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
//  Update 29 April, 2018; kongdd
var Alpha_raw = ee.List([0.000, 0.080, 0.081, 0.080, 0.058, 0.062,
		0.100, 0.100, 0.100, 0.100, 0.100, 0.023,
		0.031, 0.062, 0.031, 0.000, 0.100, 0.000]);
var Thelta_raw = ee.List([0.000, 0.033, 0.025, 0.033, 0.028, 0.040,
		0.022, 0.022, 0.025, 0.014, 0.025, 0.041,
		0.060, 0.040, 0.060, 0.000, 0.025, 0.000]);
var m_raw = ee.List([0.000, 7.586, 11.041, 7.586, 11.168, 6.623,
		7.145, 7.145, 6.012, 11.601, 5.528, 16.198,
		3.953, 6.623, 3.953, 0.000 , 5.528, 0.000]);
var Am_25_raw = ee.List([0.000, 24.495, 17.415, 24.495, 13.765, 18.324,
		10.408, 10.408, 14.292, 14.554, 16.002, 44.569,
		48.335, 18.324, 48.335, 0.000, 16.002, 0.000]);
var D0_raw = ee.List([0.000, 0.500, 0.500, 0.500, 0.500, 0.501,
		0.500, 0.500, 0.500, 0.500, 0.500, 2.000,
		2.000, 0.501, 2.000, 0.000, 0.500, 0.000]);
var kQ_raw = ee.List([0.000, 1.000, 1.000, 1.000, 0.695, 0.914,
		0.100, 0.100, 0.901, 0.100, 0.734, 0.418,
		0.100, 0.914, 0.100, 0.000, 0.734, 0.000]);
var kA_raw = ee.List([0.000, 0.900, 0.900, 0.900, 0.900, 0.538,
		0.900, 0.900, 0.900, 0.900, 0.900, 0.900,
		0.900, 0.538, 0.900, 0.000, 0.900, 0.000]);
var S_sls_raw = ee.List([0.000, 0.144, 0.122, 0.144, 0.086, 0.112,
		0.053, 0.053, 0.303, 0.083, 0.246, 0.010,
		0.227, 0.112, 0.227, 0.000, 0.246, 0.000]);
var fER0_raw = ee.List([0.000, 0.173, 0.032, 0.173, 0.010, 0.010,
		0.010, 0.010, 0.061, 0.073, 0.010, 0.010,
		0.051, 0.010, 0.051, 0.000, 0.010, 0.000]);
		
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
    // modis landcover 18 types
    var lands = ee.List.sequence(0, 17).map(function(i) {
        i = ee.Number(i);
        var land = ee.Image(landcover).eq(ee.Image(i)).float();
        var prop = ee.Image(ee.Number(list.get(i)));
        return land.multiply(prop);
    });
    return ee.ImageCollection(lands).sum();
}

/** Vapor Pressure in kPa with temperature in degC */
function vapor_pressure(t) {
    return t.expression('0.6108 * exp(17.27 * b() / (b() + 237.3))');
}

/**
 * PML_V2 (Penman-Monteith-Leuning) model
 *
 * sub functions:
 *     -- PML_daily(img)
 *     `PML_daily` has all the access of yearly land cover based parameters 
 *     (e.g. gsx, hc, LAIref, S_sls). 
 *     
 *     -- PML_year(INPUTS)
 *     
 * @param {Integer} year Used to filter landcover data and set landcover depend parameters.
 * @param {boolean} v2 Default is true, and PML_V2 will be used. If false, 
 *                     PML_V1 will be used.
 * 
 * @return {ee.ImageCollection} An ImageCollection with the bands of 
 *                                 ['GPP', 'Ec', 'Es', 'Ei', 'ET_water','qc'] for PML_V2;
 *                                 ['Ec', 'Es', 'Ei', 'ET_water','qc'] for PML_V1;
 *
 */
function PML(year, v2) {
    // fix landcover time range after 2013, 2014-2016
    year          = ee.Number(year);
    var year_land = ee.Algorithms.If(year.gt(2016), 2016, ee.Algorithms.If(year.lt(2001), 2001, year));

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
        
    if (v2){
        var Alpha   = propertyByLand_v2(land, Alpha_raw),
            Thelta  = propertyByLand_v2(land, Thelta_raw),
            m       = propertyByLand_v2(land, m_raw),
            Am      = propertyByLand_v2(land, Am_25_raw);
            // Ca      = 380; //umol mol-1
        D0      = propertyByLand_v2(land, D0_raw);
        kQ      = propertyByLand_v2(land, kQ_raw);
        kA      = propertyByLand_v2(land, kA_raw);
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
        
        var Tmax   = img.select('Tmax');  // degC
        var Tmin   = img.select('Tmin');  // degC
        var Tavg   = img.select('Tavg');  // degC
        
        var Rln    = img.select('Rln');   // W/m2/s, not MJ/m2/d 
        var Rs     = img.select('Rs');    // W/m2/s
        
        var albedo = img.select('Albedo');// %
        var emiss  = img.select('Emiss'); // %
        var LAI    = img.select('LAI');   // 0 - 
        var u2     = img.select('U2');    // m/s
        
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
        var fvpd = VPD.expression('1/(1+b()/D0)', {D0:D0}); // leuning
        
        if (v2){
            var PAR_mol = PAR.multiply(4.57);    // from [W m-2] to [umol m-2 s-1]

            /** G flux part */
            var fT2 = Tavg.expression('exp(0.031*(b()-25))/(1 +exp(0.115*(b()-41)))').min(1.0);
            var P1  = Am.multiply(Alpha).multiply(Thelta).multiply(PAR_mol),
                P2  = Am.multiply(Alpha).multiply(PAR_mol),
                P3  = Am.multiply(Thelta).multiply(Ca),
                P4  = Alpha.multiply(Thelta).multiply(PAR_mol).multiply(Ca);
            
            var Ags  = P1.expression('Ca*P1/(P2*kQ + P4*kQ) * (kQ*LAI + log((P2+P3+P4)/(P2+P3*exp(kQ*LAI) + P4)))*fT2', 
                {Ca:Ca, P1:P1, P2:P2, P3:P3, P4:P4, kQ:kQ, LAI:LAI, fT2:fT2});  // umol cm-2 s-1
            GPP  = Ags.multiply(1.0368).multiply(fvpd).rename('GPP'); //86400/1e6*12
            
            var img_check = GPP.addBands([rou_a, gama, slop, PAR, PAR_mol, fT2, P1, P2, P3, P4])
                .rename(['gpp', 'rou_a', 'gama', 'slop', 'par', 'par_mol', 'fT2', 'p1', 'p2', 'p3', 'p4']);
            
            Gc = m.expression('m/Ca*Ags*1.6', {m:m, Ca:Ca, Ags:Ags});
            // Convert from mol m-2 s-1 to cm s-1 to m s-1
            Gc = Gc.expression('Gc*1e-2/(0.446*(273/(273+Tavg))*(Pa/101.3))', 
                {Gc:Gc, Tavg:Tavg, Pa:p}); // unit convert to m s-1
        }else{
            // Conductance and ET component
            Gc = LAI.expression('gsx/kQ*log((PAR+Q50)/(PAR*exp(-kQ*LAI)+Q50))*fvpd', 
                { gsx: gsx, kQ: kQ, PAR: PAR, Q50: Q50, LAI: LAI, fvpd:fvpd }); 
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
        if (v2) newImg = newImg.addBands(GPP); //PML_V2
        
        newImg = newImg.updateMask(mask_water.not()).addBands(ET_water); //add ET_water
        newImg = newImg.multiply(1e2).toUint16(); //CONVERT INTO UINT16
        
        if (I_interp){
            var qc = img.select('qc');  
            newImg = newImg.addBands(qc);
        }
        
        var beginDate = ee.Date(img.get('system:time_start'));
        return pkg_main.setImgProperties(newImg, beginDate);
        // return pkg_main.setImgProperties(img_check, beginDate);
    }

    /**
     * Calculate yearly PML
     *
     * @param {ee.ImageCollection} INPUTS Multibands ImageCollection returned 
     * by PML_INPUTS_d8
     */
    function PML_year(INPUTS){
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
            var Es = img.expression('b("Es_eq") * b("fval_soil")').toUint16().rename('Es');
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
            var range  = [-180, -60, 180, 90],
            scale  = 1 / 240, //1/240,
            drive  = false,
            folder = asset,
            crs = 'SR-ORG:6974'; //projects/pml_evapotranspiration
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
            pkg_export.ExportImgCol(PML_Imgs, dates, range, scale, drive, folder, crs);
            // pkg_export.ExportImg_deg(img, range, '2002-07-05_v4', scale, drive, folder, crs)
        }else{
            print('PML_Imgs', PML_Imgs);    
        }
    }
    
    var INPUTS = PML_INPUTS_d8(year);
    var dates = ee.List(INPUTS.aggregate_array('system:time_start'))
        .map(function(date) { return ee.Date(date).format('yyyy-MM-dd'); }).getInfo(); //DATES of INPUT
    
    var PML_Imgs = PML_year(INPUTS);
    Export();
    return PML_Imgs;
}

function export_image(img, task){
    // 1. try to Export to drive
    var range  = [-180, -60, 180, 90];
    var bounds = ee.Geometry.Rectangle(range, 'EPSG:4326', false);

    var scale = 1/240,
        // drive = true,
        // folder = "PML_V2",
        crs = 'SR-ORG:6974'; //SR-ORG:6974, EPSG:4326
    var sizeX  = (range[2] - range[0]) / scale;
    var sizeY  = (range[3] - range[1]) / scale;
    var dimensions = sizeX.toString() + 'x' + sizeY.toString();
    // var crs_trans  = [scale, 0, -180, 0, -scale, 90];
    print(dimensions, crs_trans);
    
    var folder = 'projects/pml_evapotranspiration/PML/OUTPUT/PML_V2_8day';
    Export.image.toAsset({
        image: img,
        description: task,
        assetId: folder.concat('/').concat(task), //projects/pml_evapotranspiration/
        crs: crs,
        crsTransform: crs_trans,
        // region: bounds,
        dimensions: dimensions,
        maxPixels: 1e13
    });
}

var exec = true;
if (exec) {
    var PMLV2 = true; //If false, PML_V1 will be used!
    var bands, asset;
    if (PMLV2) {
        bands = ['GPP', 'Ec', 'Es', 'Ei', 'ET_water', 'qc']; //,'qc'
        asset = 'projects/pml_evapotranspiration/PML/OUTPUT/PML_V2_8day';//'projects/pml_evapotranspiration/PML_v2';
    } else {
        bands = ['Ec', 'Es', 'Ei', 'ET_water', 'qc'];
        asset = 'projects/pml_evapotranspiration/PML/OUTPUT/PML_V1_8day';
    }

    var year  = 2003,
        year_begin = 2007, 
        year_end   = year_begin + 3,
        save  = true, //global param called in PML_main
        debug = true;

    if (debug) {
        PML(year, PMLV2);
    } else {
        for (var year = year_begin; year <= year_end; year++)
            PML(year, PMLV2);
    }
}

exports = {
  PML: PML
};