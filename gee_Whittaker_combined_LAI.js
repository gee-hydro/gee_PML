/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var imgcol_combined_LAI = ee.ImageCollection("MODIS/006/MCD15A3H"),
    imgcol_land = ee.ImageCollection("MODIS/006/MCD12Q1");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
/** LOAD REQUIRED PACKAGES */
var pkg_main   = require('users/kongdd/public:pkg_main.js');
var pkg_trend  = require('users/kongdd/public:Math/pkg_trend.js');
var pkg_export = require('users/kongdd/public:pkg_export.js');
var pkg_whit   = require('users/kongdd/public:Math/pkg_whit.js');
// var pkg_mov    = require('users/kongdd/public:Math/pkg_movmean.js'); //movmean
// var pkg_join   = require('users/kongdd/public:pkg_join.js');
// var pkg_vis = require('users/kongdd/public:pkg_vis.js');

/** GLOBAL FUNCTIONS -------------------------------------------------------- */
/** 
 * Initial parameter lambda for whittaker
 * 
 * update 20200628, the uncertainty mainly roots in `init_lambda`. 
 *
 * @note
 * This function is now validated with Terra LAI. 
 * lambda has been constrained in the range of [1e-2, 1e3]
 * 
 * Be caution about coef, when used for other time-scale. The coefs
 * should be also updated.
 * 
 * @param {ee.ImageCollection} imgcol The input ee.ImageCollection should have 
 * been processed with quality control.
 */
pkg_whit.init_lambda = function (imgcol, mask_vi) {
    /** Define reducer 
     *  See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/Reduce
     */
    var combine = function (reducer, prev) { return reducer.combine(prev, null, true); };
    var reducers = [ee.Reducer.mean(), ee.Reducer.stdDev(), ee.Reducer.skew(), ee.Reducer.kurtosis()];
    var reducer = reducers.slice(1).reduce(combine, reducers[0]);

    var img_coef = imgcol.reduce(reducer).select([0, 1, 2, 3], ['mean', 'sd', 'skewness', 'kurtosis']);

    // Lambda of 4y or 1y coefs has no significant difference.
    // update 20200628
    var formula = "1.77365505 -0.00*b('mean')/b('sd') + 0.43062881*b('mean') - 0.34192178*b('sd') - 0.30107590*b('skewness') + 0.03221195*b('kurtosis')";   // chunk02_Extend
    // var formula = "0.9809 -0.00*b('mean')/b('sd') +0.0604*b('kurtosis') +0.7247*b('mean') -2.6752*b('sd') -0.3854*b('skewness')";   // Kong D., et al., 2019;
    // var formula = "1.0199 -0.0074*b('mean')/b('sd') +0.0392*b('kurtosis') +0.7966*b('mean') -3.1399*b('sd') -0.3327*b('skewness')"; // 4y 

    // var formula = '0.979745736 + 0.725033847*b("mean") -2.671821865*b("sd") - 0*b("mean")/b("sd") - 0.384637294*b("skewness") + 0.060301697*b("kurtosis")';
    // var formula = "0.8055 -0.0093*b('mean')/b('sd') -0.0092*b('kurtosis') +1.4210*b('mean') -3.8267*b('sd') -0.1206*b('skewness')";
    // print("new lambda formula ...");
    // Map.addLayer(img_coef, {}, 'img_coef');
    var lambda = img_coef.expression(formula);
    lambda = ee.Image.constant(10.0).pow(lambda);
    if (mask_vi) {
        lambda = lambda.where(mask_vi.not(), 2);   // for no vegetation regions set lambda = 2    
    }
    var lambda_max = 5e2;
    var lambda_min = 1e-2;
    lambda = lambda.where(lambda.gt(lambda_max), lambda_max)
        .where(lambda.lt(lambda_min), lambda_min);             // constain lambda range
    return lambda;
};

var date2str = function (x) { return ee.Date(x).format('YYYY_MM_dd'); };
/** ------------------------------------------------------------------------- */
var options = {
    order        : 2,    // difference order
    wFUN         : pkg_whit.wBisquare_array, // weigths updating function
    iters        : 3,    // Whittaker iterations
    min_ValidPerc: 0.3,  // pixel valid percentage less then 30%, is not smoothed.
    min_A        : 0.02, // Amplitude A = ylu_max - ylu_min, points are masked if 
                         // A < min_A.
    missing      : -0.05, // Missing value in band_sm are set to missing.
    band_sm      : 'Lai', // The band to smooth
    // band_qc      : 'SummaryQA', // The quality variable for band_sm
    // matrixSolve = 1;   // whittaker, matrix solve option:
    // 1:matrixSolve, 2:matrixCholeskyDecomposition, 3:matrixPseudoInverse 
};

var prj = pkg_export.getProj(imgcol_land);
print(prj);

var options_export = {
    range  : [-180, -60, 180, 89], // keep consistent with modis data range
    type   : 'asset', 
    crs    : 'SR-ORG:6974', 
    folder : 'projects/pml_evapotranspiration/PML_INPUTS/MODIS/LAI_whit2019', 
    cellsize : 1/240,
    crsTransform : prj.crsTransform
};
// print(options);
// var options;

/** 1.2 Parameters for Export scale or type */
var isExportGlobal = true,   // whether export global data?
    isExportPoint  = false,  // whether export points result at fluxnet and phenocam?
    isExportLambda = false;  // whether export whittaker lambda
var IsShow;                  // whether to show point visualization app
// IsShow = true;
if (IsShow){
    isExportGlobal = isExportPoint = isExportLambda = false;  // if show app, not export
}

// 2020-06-21; LAI is only week delay
// print(imgcol_combined_LAI.filterDate('2020-01-01', '2020-12-31'));
var imgcol_lai = ee.ImageCollection('MODIS/006/MCD15A3H')
    .filterDate('2000-01-01', '2019-12-31')
    .map(qc_LAI).select([0, 1]);
    // .select('Lai')
    // .map(function (img) { return img.multiply(0.1).copyProperties(img, img.propertyNames()); }); //scale factor 0.1
imgcol_lai = imgcol_lai.map(pkg_trend.add_dn(true, 8));
// print(imgcol_lai.limit(2))

// aggregate from 4-day into 8-day
var imgcol_d8 = pkg_trend.aggregate_prop(imgcol_lai, 'dn', 'mean'); //.select([0], ['LAI']);
imgcol_d8 = imgcol_d8.map(function (img) {
        var datestr = img.get('dn');
        var date = pkg_trend.YearDn_date(datestr);
        return img.updateMask(img.gte(0)).unmask(0)
            .set('system:time_start', date.millis()) //.mask(land_mask); // LAI[LAI < 0] <- 0
            .set('date', date.format('YYYY-MM-dd'));
    });
print(imgcol_d8.limit(3));

// only smooth the period of 20180101-20191231
var year = 2018;
var imgcol_full = imgcol_d8;

var ylu_full = get_ylu(imgcol_full);
print(ylu_full);
// Map.addLayer(ylu_full);
whit_batch(imgcol_full, year);

//////////////////////// MAIN FUNCTIONS ///////////////////////////////////////
function whit_batch(imgcol_full, year, dt){
    dt = dt || 2;
    var year_begin, year_end;
    // Combine previous and subsequent one year images, to make sure 
    // smoothing is continuous.
    // In this way, fead and till will missing one or half year, we minimize 
    // the effect in this way:
    // i.e. 3y window (2000-2002, 2003-2005, ...), then (2000-2004, 2002-2006, 
    // ...) will be used to smooth.
    // i.e. 1y window (2000, 2001, 2002, ...), then (2000-2002, 2000-2002, ..., 
    // 2001-2003.
    // 
    // Has to point out that there is no much difference in 1y and 3y window, 
    // 1y can better cope with land cover changes.
    var YEAR_MAX = 2019;
    year_begin = year - 1;
    year_end   = year + dt; 
    var year_end2 = year_end - 1;
    
    if (year_end >= YEAR_MAX){
        year_end  = YEAR_MAX;
        year_end2 = YEAR_MAX; 
        // make sure the last task also is dt+2 year
        year_begin = YEAR_MAX - dt - 1;
    }
    
    // if (2018 - year_end < dt) year_end = 2018; // combine last few years together
    var nyear = year_end - year_begin;
    
    // 1. The imgcol used to calculating lambda should be equal to the imgcol 
    // used for smoothing;
    // 2. The imgcol used to calculating lambda should be complete years. If 
    // not, statistics (i.e., mean, sd, cv, skewness and kurtosis) will have
    // a big difference
    var filterDate = ee.Filter.calendarRange(year_begin, year_end, "year");
    var imgcol = imgcol_full.filter(filterDate);

    var dates = ee.List(imgcol.aggregate_array('system:time_start'));
    var years = dates.map(function(x){ return ee.Date(x).get("year"); });
    
    // Only center part remained
    var I_beg = years.indexOf(year);
    var I_end = years.lastIndexOfSubList([year_end2]).add(1);
    // print(year, year_begin, year_end, nyear);
    // print(years, I_beg, I_end);
    
    // dates convert to band names
    var matBands = dates.slice(I_beg, I_end)
        .map(function(x) { return ee.String('b').cat(ee.Date(x).format('YYYY_MM_dd')); });
  
    var ylu, lambda, task;
    /** subroute for Whittaker algorithm */
    // 1. boundaries
    // ylu = get_ylu(imgcol); // y boundary; // print(ylu);
    // ylu = pkg_whit.merge_ylu(ylu_full, ylu);
    ylu = ylu_full;
    // ylu = ylu.clip(bounds); // update 2018-07-28
    
    // 2. lambda (Whittaker lambda)
    // filter again to exclude 2018 incomplete date, fixed 2018-07-16
    // var imgcol_temp = imgcol.select(0).filterDate('2000-01-01', '2019-12-31');
    var imgcol_temp = pkg_whit.check_ylu(imgcol.select(0), ylu);
    /** Export subroute */
    lambda = pkg_whit.init_lambda(imgcol_temp); // first band
    // lambda = ee.Image.constant(2);
    // options.wFUN = wSELF;
    task = 'wWH_' + year + "_" + year_end2;
    print(task);
   
    // 3. whittaker main entries
    var whit = pkg_whit.whit_imgcol(imgcol, options, lambda, ylu);
    var mat_zs = whit.zs; // curve fitting matrix, 2d ee.ImageArray
    var mat_ws = whit.ws; // weights matrix
    
    // array to multiple band image
    mat_zs = mat_zs.arraySlice(0, I_beg, I_end); // small range
    // 1: column axis; -1: last column
    var img_out = mat_zs.arraySlice(1, -1).arrayProject([0])
        .arrayFlatten([matBands]); // only select the last iter

    img_out = img_out.multiply(1e4).int16(); // To int16 for storage

    /** export global data */
    // 4.2 export global data
    if (isExportGlobal){
        pkg_export.ExportImg(img_out, task, options_export);
    }
    
    return {
      imgcol: imgcol,
      lambda: lambda,
      smooth: whit
    }; // without removing head and tail adding
}


/** Initialize weights ------------------------------------------------------ */
function qc_LAI(img) {
    var FparLai_QC = img.select('FparLai_QC');
    var FparExtra_QC = img.select('FparExtra_QC');

    var qc_scf = pkg_main.getQABits(FparLai_QC, 5, 7); //bit5-7, 1110 0000, shift 5
    var qc_snow = pkg_main.getQABits(FparLai_QC, 2); //bit2, snow or ice
    var qc_aerosol = pkg_main.getQABits(FparLai_QC, 3); //bit3 
    var qc_cirrus = pkg_main.getQABits(FparLai_QC, 4); //bit4
    var qc_cloud = pkg_main.getQABits(FparLai_QC, 5); //bit5
    var qc_shadow = pkg_main.getQABits(FparLai_QC, 6); //bit6
    /**
     * items               | weights
     * --------------------|--------
     * snow, cloud, shadow | 0
     * aerosol, cirrus     | 0.5
     */
    var w = img.select(0).mask(); //unknow why can use ee.Image(1)
    var q_0 = qc_snow.or(qc_cloud).or(qc_shadow);
    var q_1 = qc_aerosol.or(qc_cirrus);

    w = w.where(q_1, 0.5).where(q_0, 0.05);
    // var img2    = img.select('Lai').updateMask(qc_mask).divide(5);
    return ee.Image(img.select('Lai')).divide(10)
        .addBands([w, qc_scf, qc_snow, qc_aerosol, qc_cirrus, qc_cloud, qc_shadow])
        .rename(['Lai', 'w', 'qc_scf', 'qc_snow', 'qc_aerosol', 'qc_cirrus', 'qc_cloud', 'qc_shadow'])
        .copyProperties(img, img.propertyNames());
}

/**
 * Get VI boundaries
 * 
 * @param  {ee.ImageCollection} imgcol VI index should be at first band, 
 *                                     'w', 'good' and 'margin' should be in bandNames.
 * @param  {double} [wmin] [description]
 * @return {ee.Image}           [ymin, ymax]
 */
function get_ylu(imgcol, wmin, band_VI){
    wmin    = wmin    || 0.2;  
    band_VI = band_VI || 0;

    var n    = imgcol.size();
    var perc_margin = imgcol.select(["w"])
        .map(function(img) { return img.gte(0.5); })
        .sum().divide(imgcol.size());
    var perc_good = imgcol.select(["w"])
        .map(function(img) { return img.gte(1); })
        .sum().divide(imgcol.size());
    // var perc = imgcol.select(['good', 'margin']).count().divide(n).unmask(0); // percentage
    
    // weights less than `w_critical`, will be masked
    var w_critical = ee.Image(wmin);
    w_critical = w_critical.where(perc_margin.gte(0.4), 0.5);
    w_critical = w_critical.where(perc_good.gte(0.4), 1);
    
    // Map.addLayer(w_critical, {}, 'w_critical');
    var imgcol_perc = imgcol.map(function(img){
        var mask = img.select('w').gte(w_critical);
        return img.updateMask(mask);
    }).select(band_VI);
    
    // 1% percentile
    var ymax = imgcol_perc.max(), 
        ymin = imgcol_perc.reduce( ee.Reducer.percentile([1]) ); //0.5
    
    return ymin.addBands(ymax).rename(['min', 'max']);
}
