/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var ImgCol_gldas = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/GLDAS_v21_8day"),
    imgcol_LAI = ee.ImageCollection("MODIS/006/MCD15A3H"),
    imgcol_VI = ee.ImageCollection("MODIS/006/MOD13A1"),
    imgcol_gpp_mod = ee.ImageCollection("MODIS/006/MOD17A2H"),
    imgcol_v1 = ee.ImageCollection("projects/pml_evapotranspiration/PML/OUTPUT/PML_V1_yearly"),
    imgcol_v2_yearly_v013 = ee.ImageCollection("projects/pml_evapotranspiration/PML/v012/PML_V2_yearly_v013"),
    imgcol_v2_yearly_v014 = ee.ImageCollection("projects/pml_evapotranspiration/PML/v012/PML_V2_yearly_v014"),
    imageCollection = ee.ImageCollection("CIESIN/GPWv4/population-density");
/***** End of imports. If edited, may not auto-convert in the playground. *****/

var pkg_vis   = require('users/kongdd/public:pkg_vis.js');
var pkg_trend = require('users/kongdd/public:Math/pkg_trend.js');

var pkg_mov    = require('users/kongdd/public:Math/pkg_movmean.js'); //movmean
var pkg_join   = require('users/kongdd/public:pkg_join.js');
var pkg_main   = require('users/kongdd/public:pkg_main.js');
var pkg_trend  = require('users/kongdd/public:Math/pkg_trend.js');
var pkg_export = require('users/kongdd/public:pkg_export.js');
// var points     = require('users/kongdd/public:data/flux_points.js').points;


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

// var prj = pkg_export.getProj(imgcol_land);

var imgcol_vpd = ImgCol_gldas.map(PML_daily).select([0], ['VPD']);

function calYearlyTrend(imgcol, band){
    var years  = ee.List.sequence(2003, 2017);
    var imgcol_years = years.map(function(year){
        year = ee.Number(year);
        var date = ee.Date.fromYMD(year, 1, 1);
        
        var annual = imgcol.filter(ee.Filter.calendarRange(year, year, 'year'))
            // .select(bands)
            .mean(); // .multiply(36525);
        
        // Land cover data range: 2000-2016, add IGBP data into output for
        // calculate annual change grouped by IGBP.
            
        // var ET  = annual.expression('b("Ec") + b("Es")+ b("Ei")').rename('ET'); // + b("Ei")
        var img = annual.toFloat() //returned img
            .set('system:time_start', date.millis())
            .set('system:index', date.format('YYYY-MM-dd'))
            .set('system:id', date.format('YYYY-MM-dd'));
        
        // if (V2){
        //     var WUE = annual.expression('b("GPP") / ET', {ET:ET}).rename('WUE');
        //     img = img.addBands([WUE]);//, land
        // }
        // img = img.addBands([land]);//, land
        // ET  = ee.Image(toInt(ET));
        // GPP = ee.Image(toInt(GPP));
        // var WUE = annual.expression('b("GPP") / b("Ec")').rename('WUE');
        return img;
    });

    imgcol_years  = ee.ImageCollection(imgcol_years).select([0], [band]);
    var img_mean  = imgcol_years.mean().rename('mean');
    var img_trend = pkg_trend.imgcol_trend(imgcol_years, band, true);
    
    return img_trend.addBands(img_mean);
}

function calETSum(img){
    var ET = img.expression('b("Ec") + b("Ei") + b("Es")').rename('ET');
    // img = img.addBands(ET);
    // var wue = img.expression('b("GPP")/b("ET")').rename('WUE');
    // img = img.addBands(wue);
    return img.addBands(ET);
}

var imgcol_v2 = imgcol_v2_yearly_v014.map(calETSum);
imgcol_v1 = imgcol_v1.map(calETSum);

var t_vpd  = calYearlyTrend(imgcol_vpd, 'VPD');
var t_LAI  = calYearlyTrend(imgcol_LAI, 'Lai');
var t_EVI  = calYearlyTrend(imgcol_VI, 'EVI');
var t_NDVI = calYearlyTrend(imgcol_VI, 'NDVI');
var t_gpp  = calYearlyTrend(imgcol_v2, 'GPP');
var t_et_v2   = calYearlyTrend(imgcol_v2, 'ET');
var t_et_v1   = calYearlyTrend(imgcol_v1, 'ET');

var t_gpp_mod  = calYearlyTrend(imgcol_gpp_mod, 'GPP');

var vis_gpp = {min:-20, max:20, palette:["ff0d01","fafff5","2aff03"], bands:'slope'};
var vis_et  = {min:-20, max:20, palette:["ff0d01","fafff5","2aff03"], bands:'slope'};

var vis_slp = {min:-0.1 , max:0.1 , palette:["ff0d01","fafff5","2aff03"], bands:'slope'};
var vis_vi  = {min:-0.01, max:0.01, palette:["ff0d01","fafff5","2aff03"], bands:'slope'};

var lg_slp = pkg_vis.grad_legend(vis_slp, 'Trend (kPa y-1)', false); //gC m-2 y-2
var lg_vi  = pkg_vis.grad_legend(vis_vi , 'Trend (VI y-1)', false); //gC m-2 y-2
var lg_et  = pkg_vis.grad_legend(vis_et , 'ET Trend (mm y-1)', false); //gC m-2 y-2
var lg_gpp = pkg_vis.grad_legend(vis_gpp, 'GPP Trend (gc y-1)', false); //gC m-2 y-2

/** EXPORT */
var prj = pkg_export.getProj(imgcol_gpp_mod);
var range     = [-180, -60, 180, 90],
    bounds    = ee.Geometry.Rectangle(range, 'EPSG:4326', false), //[xmin, ymin, xmax, ymax]
    cellsize  = 1 / 240, //1/240,
    type      = 'asset',
    folder    = 'projects/pml_evapotranspiration/PML/OUTPUT/TREND',
    crs       = 'SR-ORG:6974', //projects/pml_evapotranspiration
    crsTransform = prj.crsTransform;
    
pkg_export.ExportImg(t_gpp  , 'PMLV2_gpp_annual_trend', range, cellsize, type, folder, crs);
pkg_export.ExportImg(t_et_v2, 'PMLV2_et_annual_trend', range, cellsize, type, folder, crs); //, crsTransform

// pkg_vis.add_lgds([lg_slp, lg_vi]);

// Map.addLayer(t_vpd, vis_slp, 'gpp');
// Map.addLayer(t_LAI.divide(1e2), vis_vi, 'LAI');
// Map.addLayer(t_EVI.divide(1e4), vis_vi, 'EVI');
// // Map.addLayer(t_NDVI.divide(1e4), vis_vi, 'NDVI');

// Map.addLayer(t_gpp    , vis_gpp, 'gpp');
// Map.addLayer(t_gpp_mod, vis_gpp, 'gpp mod');

// Map.addLayer(t_et_v1 , vis_et , 'et_v1');
// Map.addLayer(t_et_v2 , vis_et , 'et_v2');

// 
var maps = pkg_vis.layout(4);

// // multiple panel map
// 
var labels = ['(a) PML-V1 ET', //meteorological forcing 
    '(b) PMLV2 ET', '(c) MOD17 GPP', '(d) PMLV2 GPP'];
var imgs = [t_et_v1, t_et_v2, t_gpp_mod, t_gpp];

var options = {
    fullscreenControl: false, 
    mapTypeControl   : false,
    zoomControl: false,
    layerList  : false
};

var dataset = ee.ImageCollection('CIESIN/GPWv4/population-density');
var populationDensity = dataset.select('population-density');
var populationDensityVis = {
  min: 100.0,
  max: 1000.0,
  palette: ['ffffff', 'ffcdc6', 'ff0000', '950000'],
};
// Map.setCenter(79.1, 19.81, 3);
// Map.addLayer(populationDensity, populationDensityVis, 'Population Density');

maps[1].addLayer(t_gpp, vis_gpp, labels[3]);
maps[1].addLayer(imgcol_v2, {}, 'original data');

maps[2].add(lg_gpp);
maps[2].addLayer(populationDensity, populationDensityVis, 'Population Density');

maps.forEach(function(value, i) {
    var img = imgs[i];
    // var img = imgcol.first().select('GPP');
    var lab_style = {fontWeight:'bold', fontSize: 36};
    
    var vis =  i > 2 ? vis_gpp : vis_et;
    
    var map = maps[i];
    // map.setControlVisibility(options);
    map.addLayer(img.select('slope'), vis, labels[i]);
    map.widgets().set(3, ui.Label(labels[i], lab_style));
});

maps[0].add(lg_et);

function vapor_pressure(t) {
    return t.expression('0.6108 * exp(17.27 * b() / (b() + 237.3))');
}

function PML_daily(img) {
    img = ee.Image(img);
    var q      = img.select('q');     // kg/kg;
    var p      = img.select('Pa');    // kPa
    
    var Tmax   = img.select('Tmax');  // degC
    var Tmin   = img.select('Tmin');  // degC
    var Tavg   = img.select('Tavg');  // degC
    
    var Rln    = img.select('Rln');   // W/m2/s, not MJ/m2/d 
    var Rs     = img.select('Rs');    // W/m2/s
    var u2     = img.select('U2');    // m/s
    
    // var albedo = img.select('Albedo');// %
    // var emiss  = img.select('Emiss'); // %
    // var LAI    = img.select('LAI');   // 0 - 
    // var Ca     = img.select('co2');   //umol mol-1
    
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
    // var Rns   = ee.Image(1).subtract(albedo).multiply(Rs);
    // var RLout = img.expression('Emiss * Stefan * pow(Tavg+273.15, 4)', 
    //     { 'Emiss': emiss, Stefan: Stefan, Tavg: Tavg }).divide(0.0864);
    // var Rnl     = Rln.subtract(RLout);
    // var Rn      = Rns.add(Rnl).max(0.0);    // to ensure Rn >= 0;
    // var PAR     = Rs.multiply(0.45).max(0); // could be used modis data to replace
    // units convert: http://www.egc.com/useful_info_lighting.php
    
    var Gc, GPP;
    // var fvpd = VPD.expression('1/(1+b()/D0)', {D0:D0});        // leuning
    var fvpd = VPD.expression('exp(-D0 * pow(b(), 2))', {D0:D0}); // yongqiang, f_VPD = exp(-D0 * VPD.^2);
    
    var beginDate = ee.Date(img.get('system:time_start'));
    return pkg_main.setImgProperties(VPD, beginDate);
    // if (v2){
    //     var PAR_mol = PAR.multiply(4.57);    // from [W m-2] to [umol m-2 s-1]

    //     /** G flux part */
    //     var fT2 = Tavg.expression('exp(0.031*(b()-25))/(1 +exp(0.115*(b()-41)))').min(1.0).multiply(fvpd);
    //     var P1  = Am.multiply(Alpha).multiply(Thelta).multiply(PAR_mol),
    //         P2  = Am.multiply(Alpha).multiply(PAR_mol),
    //         P3  = Am.multiply(Thelta).multiply(Ca),
    //         P4  = Alpha.multiply(Thelta).multiply(PAR_mol).multiply(Ca);
        
    //     var Ags  = P1.expression('Ca*P1/(P2*kQ + P4*kQ) * (kQ*LAI + log((P2+P3+P4)/(P2+P3*exp(kQ*LAI) + P4)))*fT2', 
    //         {Ca:Ca, P1:P1, P2:P2, P3:P3, P4:P4, kQ:kQ, LAI:LAI, fT2:fT2});  // umol cm-2 s-1
    //     GPP  = Ags.multiply(1.0368).rename('GPP'); //86400/1e6*12
        
    //     var img_check = GPP.addBands([rou_a, gama, slop, PAR, PAR_mol, fT2, P1, P2, P3, P4])
    //         .rename(['gpp', 'rou_a', 'gama', 'slop', 'par', 'par_mol', 'fT2', 'p1', 'p2', 'p3', 'p4']);
        
    //     Gc = m.expression('m/Ca*Ags*1.6', {m:m, Ca:Ca, Ags:Ags});
    //     // Convert from mol m-2 s-1 to cm s-1 to m s-1
    //     Gc = Gc.expression('Gc*1e-2/(0.446*(273/(273+Tavg))*(Pa/101.3))', 
    //         {Gc:Gc, Tavg:Tavg, Pa:p}); // unit convert to m s-1
    // }else{
    //     // Conductance and ET component
    //     Gc = LAI.expression('gsx/kQ*log((PAR+Q50)/(PAR*exp(-kQ*LAI)+Q50))*fvpd', 
    //         { gsx: gsx, kQ: kQ, PAR: PAR, Q50: Q50, LAI: LAI, fvpd:fvpd }); 
    // }
    // Gc = Gc.max(1e-6); 
    // // known bug: bare, ice & snow, unc, all zero parameters will lead to p1, p2, p3, p4 = 0,
    // //            GPP = 0/0(masked), and Ec = masked.
    
    // /** AERODYNAMIC CONDUCTANCE */
    // var d   = hc.multiply(0.64);
    // var zom = hc.multiply(0.13);
    // var zoh = zom.multiply(0.1);
    // var uz  = img.expression('log(67.8*Zob - 5.42)/4.87 * u2', 
    //     { Zob: Zob, u2: u2 });
    // var Ga  = img.expression('uz*kmar*kmar / (log((Zob-d)/zom) * log((Zob-d)/zoh))', 
    //     { uz: uz, kmar: kmar, Zob: Zob, zom: zom, zoh: zoh, d: d });

    // // Equilibrium evaporation
    // var Eeq = img.expression('slop/(slop+gama)*Rn', { slop: slop, gama: gama, Rn: Rn })
    //     .divide(lambda).multiply(86.4) // convert W/m2/s into mm
    //     .max(0.0001); 
    // // Penman Monteith potential ET
    // var Evp = VPD.expression('(gama/(slop+gama))*((6430 * (1 + 0.536*u2) * VPD)/lambda)', 
    //     { slop: slop, gama: gama, u2: u2, VPD: VPD, lambda: lambda })
    //     .max(0);
    // var mask_water = land.expression('b() == 0 || b() == 15'); //water, snow&ice
    // var ET_water   = Eeq.add(Evp).updateMask(mask_water).rename('ET_water');

    // // // Convert MJ/m2/day into W/m2;
    // // Rn  = Rn.divide(0.0864).max(0);
    // // PAR = PAR.divide(0.0864).max(0);
    
    // // Conductance and ET component
    // var Tou = LAI.expression('exp(-kA*LAI)', { kA: kA, LAI: LAI });

    // // % Transpiration from plant cause by radiation water transfer
    // var LEcr = slop.expression('slop/gama*Rn *(1 - Tou)/(slop/gama + 1 + Ga/Gc)', 
    //     { slop: slop, gama: gama, Rn: Rn, Tou: Tou, Ga: Ga, Gc: Gc });               // W/m2
    // // var LEcr = landmask.* LEcr;

    // // % Transpiration from plant cause by aerodynamic water transfer
    // var LEca = slop.expression('(rou_a * Cp * Ga * VPD / gama)/(slop/gama + 1 + Ga/Gc)', 
    //     { rou_a: rou_a, Cp: Cp, Ga: Ga, Gc: Gc, VPD: VPD, gama: gama, slop: slop }); // W/m2

    // // % making sure vegetation transpiration is negaligable, this is very important for very dry Sahara
    // // Should take it seriously. LAI = 0, will lead to a extremely large value. 
    // // Update 24 Aug'2017, kongdd
    // LEca = LEca.where(LAI.lte(0.0), 0.0);
    // LEcr = LEcr.where(LAI.lte(0.0), 0.0);
    // var LEc = LEca.add(LEcr);
    
    // // % Soil evaporation at equilibrium
    // var LEs_eq = slop.expression('(slop/gama)* Rn *Tou/(slop/gama + 1)', 
    //     { slop: slop, gama: gama, Rn: Rn, Tou: Tou });

    // /** W/m2 change to mm d -1 */
    // var coef_MJ2mm = lambda.divide(86.4); // ET./lambda*86400*10^-3;
    // var Es_eq = LEs_eq.divide(coef_MJ2mm);
    // var Ecr   = LEcr.divide(coef_MJ2mm);
    // var Eca   = LEca.divide(coef_MJ2mm);
    // var Ec    = LEc.divide(coef_MJ2mm);

    // /** 
    // * Interception Precipitation Evaporation: prcp_real = prcp - Ei 
    // * @references 
    // * Van Dijk, A.I.J.M. and Warren, G., 2010. The Australian water resources assessment system. Version 0.5, 3(5). P39
    // */
    // var prcp = img.select('Prcp');
    // var fveg = LAI.expression('1 - exp(-LAI/LAIref)', { LAI: LAI, LAIref: LAIref });
    // var Sveg = S_sls.multiply(LAI);
    
    // var fER  = fveg.multiply(fER0);
    // var prcp_wet = LAI.expression('-log(1 - fER0) / fER0 * Sveg / fveg', 
    //     { fER0: fER0, fveg: fveg, Sveg: Sveg });
    // var Ei = LAI.expression('(P < Pwet) * fveg * P + (P >= Pwet) * ( fveg*Pwet + fER*(P - Pwet) )', 
    //     { fveg: fveg, fER: fER, P: prcp, Pwet: prcp_wet });
    // var Pi = prcp.subtract(Ei);
    // // (P < Pwet) * fveg * P + (P >= Pwet) * ( fveg*Pwet + fER*(P - Pwet) )
    // //    NA and infinite values should be replaced as zero. But GEE where and 
    // //    updatemask are incompetent.
    // // ----------------------------------------------------------------------
    
    // // var newBands = ['ETsim', 'Es', 'Eca', 'Ecr', 'Ei', 'Eeq', 'Evp', 'Es_eq'];
    // var newBands = ['Es_eq', 'Ec', 'Ei', 'Pi']; //'Eeq', 'Evp', 'ETsim', 'Es'
    // var newImg = ee.Image([Es_eq, Ec, Ei, Pi]).rename(newBands);
    // if (v2) newImg = newImg.addBands(GPP); //PML_V2
    
    // newImg = newImg.updateMask(mask_water.not()).addBands(ET_water); //add ET_water
    // // Comment 2018-09-05, to get yearly sum, it can be converted to uint16
    // // otherwise, it will be out of range.
    // // newImg = newImg.multiply(1e2).toUint16(); //CONVERT INTO UINT16 
    
    // if (I_interp){
    //     var qc = img.select('qc');  
    //     newImg = newImg.addBands(qc);
    // }
    
    
    // return pkg_main.setImgProperties(newImg, beginDate);
    // return pkg_main.setImgProperties(img_check, beginDate);
}
