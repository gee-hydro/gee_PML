// var pkg_ET = require('users/kongdd/gee_PML:src/pkg_ET.js');
var pkg_ET = {};
var pkg_join = require('users/kongdd/public:pkg_join.js');
var pkg_trend = require('users/kongdd/public:Math/pkg_trend.js');

/**
 * Prepare INPUT datset for PML_V2
 *
 * @param {[type]} begin_year [description]
 * @param {[type]} end_year   [description]
 */
pkg_ET.PML_INPUTS_d8 = function (begin_year, end_year, I_interp,
    imgcol_lai, imgcol_albedo, imgcol_emiss, ImgCol_gldas) 
{
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

/**
 * Calculate daily PML GPP and ET using GLDAS and MODIS inputs.
 * 
 * @param  {Image} img GLDAS meteorological forcing data and MODIS remote sensing data
 *    with bands: ['LAI', 'Emiss', 'Albedo', 'Pa', 'Tmax', 'Tmin', 'Tavg', 'Prcp', 'Rln', 'Rs', 'U2']
 * 
 * @return {Image} PML_ET with bands of ['ET_water', 'Es_eq', 'Ec', 'Ei', 'Pi']; 
 *                 If v2 = true, GPP also will be returned.
 */
function PML_daily(img, is_PMLV2) {
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
    var fvpd = VPD.expression('(VPDmax - b())/(VPDmax - VPDmin)', { VPDmin: VPDmin, VPDmax: VPDmax })
        .min(1.0).max(0.0);

    if (is_PMLV2) {
        var PAR_mol = PAR.multiply(4.57);    // from [W m-2] to [umol m-2 s-1]

        /** G flux part */
        var fT2 = Tavg.expression('exp(0.031*(b()-25))/(1 +exp(0.115*(b()-41)))').min(1.0);

        var P1 = Am.multiply(Alpha).multiply(Thelta).multiply(PAR_mol),
            P2 = Am.multiply(Alpha).multiply(PAR_mol),
            P3 = Am.multiply(Thelta).multiply(Ca),
            P4 = Alpha.multiply(Thelta).multiply(PAR_mol).multiply(Ca).divide(fT2);

        var Ags = P1.expression('Ca*P1/(P2*kQ + P4*kQ) * (kQ*LAI + log((P2+P3+P4)/(P2+P3*exp(kQ*LAI) + P4)))', //*fT2
            { Ca: Ca, P1: P1, P2: P2, P3: P3, P4: P4, kQ: kQ, LAI: LAI, fT2: fT2 });  // umol cm-2 s-1
        GPP = Ags.multiply(1.0368).multiply(fvpd).rename('GPP'); //86400/1e6*12

        var img_check = GPP.addBands([rou_a, gama, slop, PAR, PAR_mol, fT2, P1, P2, P3, P4])
            .rename(['gpp', 'rou_a', 'gama', 'slop', 'par', 'par_mol', 'fT2', 'p1', 'p2', 'p3', 'p4']);

        Gc = m.expression('m/Ca*Ags*1.6*fvpd_gc', { m: m, Ca: Ca, Ags: Ags, fvpd_gc: fvpd_gc });
        // Convert from mol m-2 s-1 to cm s-1 to m s-1
        Gc = Gc.expression('Gc*1e-2/(0.446*(273/(273+Tavg))*(Pa/101.3))',
            { Gc: Gc, Tavg: Tavg, Pa: p }); // unit convert to m s-1
    } else {
        // Conductance and ET component
        Gc = LAI.expression('gsx/kQ*log((PAR+Q50)/(PAR*exp(-kQ*LAI)+Q50))*fvpd_gc',
            { gsx: gsx, kQ: kQ, PAR: PAR, Q50: Q50, LAI: LAI, fvpd_gc: fvpd_gc });
    }
    Gc = Gc.max(1e-6);
    // known bug: bare, ice & snow, unc, all zero parameters will lead to p1, p2, p3, p4 = 0,
    //            GPP = 0/0(masked), and Ec = masked.

    /** AERODYNAMIC CONDUCTANCE */
    var d = hc.multiply(0.64);
    var zom = hc.multiply(0.13);
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
    var fveg = LAI.expression('1 - exp(-LAI/LAIref)', { LAI: LAI, LAIref: LAIref });
    var Sveg = S_sls.multiply(LAI);

    var fER = fveg.multiply(fER0);
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


pkg_ET.add_ETsum = function(img){
    var ET = img.expression('b("Ec") + b("Ei") + b("Es")').rename("ET");
    return img.addBands(ET);
}

pkg_ET.aggregate_yearly = function(imgcol, band, scale_factor) {
    band = band || 0;
    scale_factor = scale_factor || 1;

    imgcol = imgcol.select(band).filterDate('2003-01-01', '2018-12-31')
        .map(pkg_trend.addSeasonProb);

    var imgcol_annual = pkg_trend.aggregate_prop(imgcol, 'Year', 'mean')
        .map(function (img) { return img.multiply(scale_factor).copyProperties(img, ["system:time_start"]); });
    // .map(set_yearly_timestart);
    return imgcol_annual;
}

pkg_ET.yearly_anomaly = function(imgcol, band, scale_factor, is_yearly) {
    if (is_yearly === undefined) {
        is_yearly = false;
    }

    if (!is_yearly) {
        imgcol = aggregate_yearly(imgcol);
    }

    var img_2003 = imgcol.first();
    var imgcol_diff = imgcol
        .map(function (img) { return img.subtract(img_2003).copyProperties(img, ["system:time_start"]); });
    // print(imgcol_annual.limit(3), imgcol_diff.limit(3));
    return imgcol_diff;
}

/**
 * Construct parameters depend on landcover type
 *
 * @param  {ee.Image} landcover [description]
 * @param  {ee.List}  list      [description]
 * @return {ee.Image}           [description]
 */
pkg_ET.propertyByLand_v2 = function(landcover, list) {
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

/** Vapor Pressure in kPa with temperature in degC */
pkg_ET.vapor_pressure = function (t){
    return t.expression('0.6108 * exp(17.27 * b() / (b() + 237.3))');
}



exports = pkg_ET;
