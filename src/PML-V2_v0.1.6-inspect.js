/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var point = /* color: #d63000 */ee.Geometry.Point([-118.01513671875, 38.11727165830543]),
    ImgCol_gldas = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/GLDAS_V21_8day_V2"),
    imgcol_albedo = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/Albedo_interp_8d_v2"),
    imgcol_emiss = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/Emiss_interp_8d"),
    imgcol_lai_4d = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/LAI_whit_4d"),
    imgcol_land = ee.ImageCollection("MODIS/006/MCD12Q1"),
    co2 = ee.FeatureCollection("projects/pml_evapotranspiration/PML_INPUTS/co2_mm_gl_2002-2019_8day");
/***** End of imports. If edited, may not auto-convert in the playground. *****/

/**
 * PML_V2 (Penman-Monteith-Leuning) model 
 *
 * @usage:
 * var pkg_PML = require('users/kongdd/pkgs:Math/PML_v2.js');
 *
 * ## UPDATES: 
 * # 30 April, 2018; kongdd
 * # 09 Sep  , 2018; kongdd
 *     * Add trend inspection module
 * # 03 Aug  , 2018; kongdd
 *     * Update PML_V2 images to 2019
 * 
 */

/** LOAD REQUIRED PACKAGES */
var pkg_mov = require('users/kongdd/public:Math/pkg_movmean.js'); //movmean
var pkg_join = require('users/kongdd/public:pkg_join.js');
var pkg_main = require('users/kongdd/public:pkg_main.js');
var pkg_trend = require('users/kongdd/public:Math/pkg_trend.js');
var pkg_export = require('users/kongdd/public:pkg_export.js');
var pkg_vis = require('users/kongdd/public:pkg_vis.js');
var pkg_PML = require('users/kongdd/gee_PML:pkg_PML.js');
// var points     = require('users/kongdd/public:data/flux_points.js').points;

var prj = pkg_export.getProj(imgcol_land);

var I_interp = true; // whether Interpolate MODIS LAI, Emissivity and Albedo

// `meth_interp` is used to resample  into high-resolution
// not suggest 'biculic'. bicubic can't constrain values in reasonable boundary.
var meth_interp = 'bilinear'; // or 'bicubic'; for meteometeorological forcing spatial interpolatation
var filter_date_all = ee.Filter.date('2002-07-01', '2019-12-31');

var mean_albedo = imgcol_albedo.select(0).mean().multiply(0.001), // multiple year mean
    mean_emiss = imgcol_emiss.select(0).mean().expression('b() * 0.002 + 0.49'); // multiple year mean
var land_mask = mean_emiss.mask(); // mask lead to export error, unknow reason

/** 1.1 GLDAS and CO2 */
var ImgCol_co2 = co2.toList(co2.size())
    .map(function (f) {
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
    .filter(filter_date_all)
    .sort("system:time_start");
// print(ImgCol_co2)
ImgCol_gldas = ImgCol_gldas.filter(filter_date_all);
ImgCol_gldas = pkg_join.SaveBest(ImgCol_gldas, ImgCol_co2);

/** 1.2 MODIS products: LAI, Albedo, Emissivity  */
function print_1th(imgcol) {
    var img = ee.Image(imgcol.first());
    print(img);
}

if (I_interp) {
    var imgcol_lai = require('users/kongdd/gee_PML:src/mosaic_LAI.js').smoothed
        .map(function (img) { return img.multiply(0.1).copyProperties(img, img.propertyNames()); }); //scale factor 0.1
    imgcol_lai = ee.ImageCollection(imgcol_lai.toList(2000));
    // print(imgcol_lai);

    imgcol_emiss = ee.ImageCollection(imgcol_emiss.toList(1000))
        .map(function (img) {
            var emiss = img.select(0).expression('b() * 0.002 + 0.49'); //.toFloat(); //.toUint8()
            return img.select('qc').addBands(emiss);
        }).select([1, 0], ['Emiss', 'qc']);

    imgcol_albedo = ee.ImageCollection(imgcol_albedo.toList(1000))
        .map(function (img) {
            var albedo = img.select(0).multiply(0.001); //.toFloat();
            return img.select(1).addBands(albedo);
        }).select([1, 0], ['Albedo', 'qc']);//scale factor 0.001, no units;
    // print('Interped');
} else {
    /** No Interpolation MODIS INPUTS */
    imgcol_lai = ee.ImageCollection('MODIS/006/MCD15A3H').select('Lai')
        .map(function (img) { return img.multiply(0.1).copyProperties(img, img.propertyNames()); }); //scale factor 0.1

    imgcol_emiss = ee.ImageCollection('MODIS/006/MOD11A2')
        .select(['Emis_31', 'Emis_32'])
        .map(function (img) {
            return img.reduce(ee.Reducer.mean()).multiply(0.002).add(0.49)
                .copyProperties(img, ['system:time_start', 'system:id']);
        }).select([0], ['Emiss']);

    var Albedo_raw = ee.ImageCollection('MODIS/006/MCD43A3').select(['Albedo_WSA_shortwave'])
        .map(pkg_trend.add_dn(true));
    imgcol_albedo = pkg_trend.aggregate_prop(Albedo_raw, 'd8', 'mean')
        .map(function (img) { return img.addBands(img.multiply(0.001)).select([1]); })
        .select([0], ['Albedo']);
    // print('No Interped');
}
// print_1th(imgcol_lai);
// print_1th(imgcol_emiss);
// print_1th(imgcol_albedo);

/**
 * Prepare INPUT datset for PML_V2
 *
 * @param {[type]} begin_year [description]
 * @param {[type]} end_year   [description]
 */
function PML_INPUTS_d8(begin_year, end_year) {
    if (typeof end_year === 'undefined') { end_year = begin_year; }
    begin_year = ee.Number(begin_year);
    end_year = ee.Number(end_year);

    var begin_yearStr = begin_year.format('%d'),
        end_yearStr = end_year.format('%d');
    var date_begin = ee.Date(ee.Algorithms.If(begin_year.eq(ee.Number(2002)),
        begin_yearStr.cat("-07-01"), begin_yearStr.cat("-01-01"))),
        date_end = ee.Date(end_yearStr.cat("-12-31"));
    var filter_date = ee.Filter.date(date_begin, date_end);
    // print(date_begin, date_end);

    /** MODIS LAI, Albedo, Emiss */
    // var miss_date = ee.Date('2003-12-19'); //replaced with 2003-12-23
    // var lai_miss  = imgcol_lai.filterDate('2003-12-22', '2003-12-24')
    //     .map(function(img){ return pkg_main.setImgProperties(img, miss_date); })
    //     .sort("system:time_start");

    /** 4-day to 8-day */
    var LAI_d4 = imgcol_lai.filter(filter_date);//.merge(lai_miss);
    LAI_d4 = LAI_d4.map(pkg_trend.add_dn(true, 8));
    // print(imgcol_lai);

    var LAI_d8 = pkg_trend.aggregate_prop(LAI_d4, 'dn', 'mean').select([0], ['LAI']);
    // print(LAI_d4, LAI_d8, 'LAI_d8');

    LAI_d8 = LAI_d8.map(function (img) {
        return img.updateMask(img.gte(0)).unmask(0); //.mask(land_mask); // LAI[LAI < 0] <- 0
    });

    // LAI has missing images, need to fix in the future

    var Albedo_d8 = imgcol_albedo.filter(filter_date);
    var Emiss_d8 = imgcol_emiss.filter(filter_date);

    var modis_input = pkg_join.SaveBest(Emiss_d8, LAI_d8);
    modis_input = pkg_join.SaveBest(modis_input, Albedo_d8);

    // print(modis_input);
    if (I_interp) {
        // add qc bands
        modis_input = modis_input.map(function (img) {
            var qc = img.expression('b("qc") + b("qc_1")*8').toUint8(); //qc, 0-2:emiss, 3-5:albedo
            return img.select(['LAI', 'Emiss', 'Albedo']).addBands(qc);
        });
    }

    var gldas_input = ImgCol_gldas.filter(filter_date);
    if (meth_interp === 'bilinear' || meth_intterp === 'bicubic') {
        gldas_input = gldas_input.map(function (img) {
            return img.resample(meth_interp).copyProperties(img, img.propertyNames());
        });
    }

    var pml_input = pkg_join.InnerJoin(modis_input, gldas_input).sort("system:time_start");
    // Map.addLayer(pml_input, {}, 'pml_input');
    // Map.addLayer(modis_input, {}, 'modis_input');
    return ee.ImageCollection(pml_input);
}

/** PML GLOBAL PARAMETERS */
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

/** PML_v1 parameters for Gc */
var kQ  = 0.4488,  // extinction coefficient
    kA  = 0.7,     // the attenuation of net all-wave irradicance, typically about 0.6-0.8 (Denmend, 1976, Kelliher FM et al., (1995))
    Q50 = 30,      // the value of absorbed PAR when gs=gsx/2, W/m2
    D0  = 0.7;     // the value of VPD when stomtal conductance is reduced  kpa 

/**P
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
 * @param {boolean} is_PMLV2 Default is true, and PML_V2 will be used. If false, 
 *                     PML_V1 will be used.
 * 
 * @return {ee.ImageCollection} An ImageCollection with the bands of 
 *                                 ['GPP', 'Ec', 'Es', 'Ei', 'ET_water','qc'] for PML_V2;
 *                                 ['Ec', 'Es', 'Ei', 'ET_water','qc'] for PML_V1;
 */
function PML(year, is_PMLV2) {
    // fix landcover time range after 2013, 2014-2016
    // year = ee.Number(year);    
    var img_param = pkg_PML.init_param_year(year, is_PMLV2);

    var year_land = year;
    if (year >= 2018) year_land = 2018;
    if (year <= 2001) year_land = 2001;

    var filter_date_land = ee.Filter.calendarRange(year_land, year_land, 'year');
    var land = ee.Image(pkg_PML.imgcol_land.filter(filter_date_land).first());

    /** Initial parameters */
    if (is_PMLV2) {
        D0 = img_param.get('D0');
        kQ = img_param.get('kQ');
        kA = img_param.get('kA');
        // for PML_v1 D0, kQ, kA are constant parameters.
    }

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
        var Ca = img.select('co2');   //umol mol-1
        var q = img.select('q');     // kg/kg;
        var p = img.select('Pa');    // kPa
        var u2 = img.select('U2');    // m/s

        var Tmax = img.select('Tmax');  // degC
        var Tmin = img.select('Tmin');  // degC
        var Tavg = img.select('Tavg');  // degC

        var Rln = img.select('Rln');   // W/m2/s, not MJ/m2/d 
        var Rs = img.select('Rs');    // W/m2/s

        var albedo = img.select('Albedo');// %
        var emiss = img.select('Emiss'); // %
        var LAI = img.select('LAI');   // 0 - 

        var lambda = 2500; // latent heat of vaporization, 2500 [J g-1]  at 25 degC
        lambda = Tavg.multiply(-2.2).add(lambda);
        /** 
         * ACTUAL VAPOUR PRESSURE
         * https://www.eol.ucar.edu/projects/ceop/dm/documents/refdata_report/eqns.html, Eq-17
         */
        var ea = img.expression('q * p / (0.622 + 0.378 * q)', { 'p': p, 'q': q });

        // saturation vapour pressure from Tair
        var es_tmax = vapor_pressure(Tmax);
        var es_tmin = vapor_pressure(Tmin);
        var es_tavg = vapor_pressure(Tavg);
        var es = es_tmax.add(es_tmin).divide(2);

        var VPD = es.subtract(ea).max(0.001);

        var rou_a = img.expression('3846 * Pa / (Tavg + 273.15)',
            { 'Pa': p, 'Tavg': Tavg });
        var gama = img.expression('Cp*Pa/(0.622*lambda)',
            { Cp: Cp, Pa: p, lambda: lambda }); // kpa/0C
        var slop = img.expression('4098 * es / pow(Tavg + 237.3, 2)',
            { 'es': es_tavg, 'Tavg': Tavg });

        // downward Solar Radiation
        var Stefan = 4.903e-9;// Stefan-Boltzmann constant [MJ K-4 m-2 day-1],
        var Rns = ee.Image(1).subtract(albedo).multiply(Rs);
        var RLout = img.expression('Emiss * Stefan * pow(Tavg+273.15, 4)',
            { 'Emiss': emiss, Stefan: Stefan, Tavg: Tavg }).divide(0.0864);
        var Rnl = Rln.subtract(RLout);
        var Rn = Rns.add(Rnl).max(0.0);    // to ensure Rn >= 0;
        var PAR = Rs.multiply(0.45).max(0); // could be used modis data to replace
        // units convert: http://www.egc.com/useful_info_lighting.php

        var Gc, GPP;
        var fvpd_gc = VPD.expression('1/(1+b()/D0)', { D0: D0 });        // leuning
        // var fvpd = VPD.expression('exp(-D0 * pow(b(), 2))', {D0:D0}); // yongqiang, f_VPD = exp(-D0 * VPD.^2);
        // var VPD_sqrt = VPD.sqrt();
        // var fvpd = VPD_sqrt.expression('b()*(b() < 1) + 1/b()*(b() >= 1)');
        var fvpd = img_param.expression("(b('VPDmax') - VPD)/(b('VPDmax') - b('VPDmin'))", { VPD: VPD})
            .min(1.0).max(0.0);

        if (is_PMLV2) {
            var PAR_mol = PAR.multiply(4.57);    // from [W m-2] to [umol m-2 s-1]

            /** G flux part */
            var fT2 = Tavg.expression('exp(0.031*(b()-25))/(1 +exp(0.115*(b()-41)))').min(1.0);

            var P1 = img_param.expression("b('Am') * b('Alpha') * b('Thlta')").multiply(PAR_mol);
            var P2 = img_param.expression("b('Am') * b('Alpha')").multiply(PAR_mol);
            var P3 = img_param.expression("b('Am') * b('Thlta')").multiply(Ca);
            var P4 = img_param.expression("b('Alpha') * b('Thlta')").multiply(PAR_mol).multiply(Ca).divide(fT2);

            var Ags = P1.expression('Ca*P1/(P2*kQ + P4*kQ) * (kQ*LAI + log((P2+P3+P4)/(P2+P3*exp(kQ*LAI) + P4)))', //*fT2
                { Ca: Ca, P1: P1, P2: P2, P3: P3, P4: P4, kQ: kQ, LAI: LAI, fT2: fT2 });  // umol cm-2 s-1
            GPP = Ags.multiply(1.0368).multiply(fvpd).rename('GPP'); //86400/1e6*12

            var img_check = GPP.addBands([rou_a, gama, slop, PAR, PAR_mol, fT2, P1, P2, P3, P4])
                .rename(['gpp', 'rou_a', 'gama', 'slop', 'par', 'par_mol', 'fT2', 'p1', 'p2', 'p3', 'p4']);

            Gc = img_param.expression('b("m")/Ca*Ags*1.6*fvpd_gc', { Ca: Ca, Ags: Ags, fvpd_gc: fvpd_gc });
            // Convert from mol m-2 s-1 to cm s-1 to m s-1
            Gc = Gc.expression('Gc*1e-2/(0.446*(273/(273+Tavg))*(Pa/101.3))',
                { Gc: Gc, Tavg: Tavg, Pa: p }); // unit convert to m s-1
        } else {
            // Conductance and ET component
            Gc = img_param.expression('b("gsx")/kQ*log((PAR+Q50)/(PAR*exp(-kQ*LAI)+Q50))*fvpd_gc',
                { kQ: kQ, PAR: PAR, Q50: Q50, LAI: LAI, fvpd_gc: fvpd_gc });
        }
        Gc = Gc.max(1e-6);
        // known bug: bare, ice & snow, unc, all zero parameters will lead to p1, p2, p3, p4 = 0,
        //            GPP = 0/0(masked), and Ec = masked.

        /** AERODYNAMIC CONDUCTANCE */
        var d = img_param.select('hc').multiply(0.64);
        var zom = img_param.select('hc').multiply(0.13);
        var zoh = zom.multiply(0.1);
        var uz = img.expression('log(67.8*Zob - 5.42)/4.87 * u2',
            { Zob: Zob, u2: u2 });
        var Ga = img.expression('uz*kmar*kmar / (log((Zob-d)/zom) * log((Zob-d)/zoh))',
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
        var ET_water = Eeq.add(Evp).updateMask(mask_water).rename('ET_water');

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
        var Ecr = LEcr.divide(coef_MJ2mm);
        var Eca = LEca.divide(coef_MJ2mm);
        var Ec = LEc.divide(coef_MJ2mm);

        /** 
         * Interception Precipitation Evaporation: prcp_real = prcp - Ei 
         * @references 
         * Van Dijk, A.I.J.M. and Warren, G., 2010. The Australian water resources assessment system. Version 0.5, 3(5). P39
         */
        var prcp = img.select('Prcp');
        var fveg = img_param.expression('1 - exp(-LAI/b("LAIref"))', { LAI: LAI});
        var Sveg = img_param.select('S_sls').multiply(LAI);

        var fER = fveg.multiply(img_param.select('fER0'));
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
        newImg = newImg.multiply(1e2).toUint16(); //CONVERT INTO UINT16 

        if (I_interp) {
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
    function PML_period(INPUTS) {
        var len = INPUTS.size();
        /** 2. ImgsRaw: ['Eeq', 'Evp', 'Es_eq', 'Eca', 'Ecr', 'Ei', 'Pi'] */
        var PML_ImgsRaw = INPUTS.map(PML_daily).sort("system:time_start");

        /** 3. Calculate fval_soil, and add Es band */
        var frame = 3; // backward moving average
        var Pi_Es = PML_ImgsRaw.select(['Pi', 'Es_eq']);
        /** movmean_lst(ImgCol, n, win_back = 0, win_forward = 0) */
        var ImgCol_mov = pkg_mov.movmean_lst(Pi_Es, len, frame);
        var fval_soil = ImgCol_mov.map(function (img) {
            return img.expression('b("Pi") / b("Es_eq")').min(1.0).max(0.0)
                .copyProperties(img, pkg_main.global_prop);
        }).select([0], ['fval_soil']);

        /** 4. calculate Es */
        var PML_Imgs_0 = pkg_join.SaveBest(PML_ImgsRaw, fval_soil); //.sort('system:time_start'); 
        var PML_Imgs = PML_Imgs_0.map(function (img) {
            var Es = img.expression('b("Es_eq") * b("fval_soil")').rename('Es').toUint16();
            // var ET = img.expression('b("Ec") + b("Ei") + Es', { Es: Es }).rename('ET');
            return img.addBands(Es); //ET
        }).select(bands); //, 'ET_water'

        // Map.addLayer(INPUTS, {}, 'INPUTS');
        // Map.addLayer(PML_ImgsRaw.select('Ec'), {}, 'Ec');
        // Map.addLayer(PML_Imgs, {}, 'PML_Imgs');
        // Map.addLayer(ImgCol_land, {}, 'land')
        return PML_Imgs;
    }

    var INPUTS = PML_INPUTS_d8(year);
    // print(INPUTS, 'INPUTS');
    // Map.addLayer(INPUTS, {}, 'INPUT');

    var PML_Imgs = PML_period(INPUTS);
    // Export();
    return PML_Imgs;
}

var exec = true;
var options = {
    range: [-180, -60, 180, 90],
    cellsize: 1 / 240, //1/240,
    type: 'asset',
    crs: 'SR-ORG:6974', //projects/pml_evapotranspiration
    crsTransform: prj.crsTransform
}

if (exec) {
    var is_PMLV2 = true; //If false, PML_V1 will be used!
    var bands, folder;
    if (is_PMLV2) {
        bands = ['GPP', 'Ec', 'Es', 'Ei', 'ET_water', 'qc']; //,'qc'
        folder = 'projects/pml_evapotranspiration/PML/V2/8day';//'projects/pml_evapotranspiration/PML_v2';
    } else {
        bands = ['Ec', 'Es', 'Ei', 'ET_water', 'qc'];
        folder = 'projects/pml_evapotranspiration/PML/OUTPUT/PML_V1_8day';
    }
    // cellsize = 1/4;
    // folder   = "projects/pml_evapotranspiration/PML/bugs";

    var year = 2003,
        year_begin = 2003,
        year_end = year_begin + 0, //year_begin + 3,
        save = true, //global param called in PML_main
        debug = false;

    var imgcol_PML, img_year;
    var begin_date, ydays;

    var years = ee.List.sequence(2003, 2018);
    var vis_et = { min: 100, max: 1600, palette: pkg_vis.colors.RdYlBu[11] },
        vis_gpp = { min: 100, max: 3500, palette: pkg_vis.colors.RdYlGn[11] };
    var vis_slp = { min: -20, max: 20, palette: ["ff0d01", "fafff5", "2aff03"] };

    var lg_gpp = pkg_vis.grad_legend(vis_gpp, 'GPP', false);
    var lg_slp = pkg_vis.grad_legend(vis_slp, 'Trend (gC m-2 y-2)', false); //gC m-2 y-2, kPa y-1

    pkg_vis.add_lgds([lg_gpp, lg_slp]);

    if (debug) {
        /** 1. Check the output of PML_V2 **/
        // var imgcol_input = PML_INPUTS_d8(2018, 2018);
        // Map.addLayer(imgcol_input, {}, 'imgcol_input');
        var imgcol_PML = PML(2018, is_PMLV2);
        // print(prj, 'prj');
        // print(imgcol_PML, 'imgcol_PML');
        pkg_export.ExportImgCol(imgcol_PML.limit(2), null, options);
        // pkg_export.ExportImgCol(imgcol_PML.limit(2), null, range, cellsize, type, folder, crs, crsTransform);
        var pkg_trend = require('users/kongdd/public:Math/pkg_trend.js');

        var imgcol_year = years.map(function (year) {
            year = ee.Number(year);
            var imgcol_PML = PML(year, is_PMLV2);

            var begin_date = ee.Date.fromYMD(year, 1, 1);
            var task = begin_date.format('YYYY-MM-dd'); //.getInfo();
            var ydays = begin_date.advance(1, 'year').difference(begin_date, 'day');

            var img_year = imgcol_PML.select(bands.slice(0, -1)).mean().multiply(ydays).divide(100)
                .toFloat()
                .set('system:time_start', begin_date.millis())
                .set('system:id', task);
            // print(img_year)
            return img_year;
        });

        imgcol_year = ee.ImageCollection(imgcol_year);
        Map.addLayer(imgcol_year, {}, "imgcol_year");
        print(imgcol_year);

        var img_trend_gpp = pkg_trend.imgcol_trend(imgcol_year, 'GPP', true);
        var img_trend_et = pkg_trend.imgcol_trend(imgcol_year, 'Ec', true);

        Map.addLayer(img_trend_gpp.select('slope'), vis_slp, 'gpp');
        Map.addLayer(img_trend_et.select('slope'), vis_slp, 'Ec');

        var img = imgcol_year.first(); //img_year; //
        Map.addLayer(img.select('GPP'), vis_gpp, 'first_year GPP');

        // var globalSum = img_GlobalSum(img);
        // print(img, globalSum, 'globalSum');

        // var mask = img.expression('b("Ec")+b("Es")+b("Ei")').expression('b() > 1e5 || b() < 0');
        // // print(imgcol_year, img_trend);

        // task = 'img_trend';
        // folder_yearly = 'projects/pml_evapotranspiration/PML/V2/yearly';
        // type = 'asset';
        // pkg_export.ExportImg(img_trend, task, range, cellsize, type, folder_yearly, crs, crsTransform);
        // Map.addLayer(mask, {min:0, max:1, palette: ['white', 'red']}, 'mask');
    } else {
        // export parameter for yearly PML
        var folder_yearly = 'projects/pml_evapotranspiration/PML/V2/yearly'; //_bilinear
        var task;

        for (var year = year_begin; year <= year_end; year++) {
            begin_date = ee.Date.fromYMD(year, 1, 1);
            task = begin_date.format('YYYY-MM-dd').getInfo();

            ydays = begin_date.advance(1, 'year').difference(begin_date, 'day');

            imgcol_PML = PML(year, is_PMLV2);
            img_year = imgcol_PML.select(bands.slice(0, -1)).mean().multiply(ydays)
                .set('system:time_start', begin_date.millis())
                .set('system:id', task);
            print(imgcol_PML)
            // pkg_export.ExportImg(img_year, task, range, cellsize, type, folder_yearly, crs, crsTransform);
            // pkg_export.ExportImgCol(imgcol_PML, null, range, cellsize, type, folder, crs, crsTransform);
        }
    }
}

exports = {
    PML: PML
};

// function Export() {
//     /** Export ImgCol into asset */
//     var save = true;
//     if (save) {
//         var dates = ee.List(INPUTS.aggregate_array('system:time_start'))
//             .map(function (date) { return ee.Date(date).format('yyyy-MM-dd'); }); //.getInfo(); //DATES of INPUT

//         // print('hello', PML_Imgs, dates);
//         var img = ee.Image(PML_Imgs.first());
//         // img = img.select(ee.List.sequence(0, 4)); //rm qc band
//         // var crs_trans = img.select('qc').projection().transform();
//         // img = img.reproject(crs, crs_trans);
//         // print(img, crs_trans);
//         // Map.addLayer(img);
//         // Map.addLayer(PML_Imgs, {}, 'PML_Imgs')
//         // print(PML_Imgs, dates);
//         // export_image(img, '2002-07-05_v6');
//         pkg_export.ExportImgCol(PML_Imgs, dates, options);
//         // pkg_export.ExportImg(img, range, '2002-07-05_v4', scale, drive, folder, crs)
//     } else {
//         print('PML_Imgs', PML_Imgs);
//     }
// }
