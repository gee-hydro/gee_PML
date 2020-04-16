/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var ImgCol_gldas = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/GLDAS_V21_8day_V2"),
    imgcol_albedo = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/Albedo_interp_8d_v2"),
    imgcol_emiss = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/Emiss_interp_8d"),
    imgcol_lai_4d = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/LAI_whit_4d"),
    co2 = ee.FeatureCollection("projects/pml_evapotranspiration/PML_INPUTS/co2_mm_gl_2002-2019_8day"),
    imgcol_land = ee.ImageCollection("MODIS/006/MCD12Q1");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var pkg_forcing = {};

/**
 * Note:
 *  If `year_end` > `year_start` and `is_dynamic` = true, only the first images 
 *  (46) returned.
 */

// var pkg_forcing = require('users/kongdd/gee_PML:pkg_PML_forcing.js');
var pkg_join = require('users/kongdd/public:pkg_join.js');
var pkg_trend = require('users/kongdd/public:Math/pkg_trend.js');


var I_interp = true; // whether Interpolate MODIS LAI, Emissivity and Albedo
// `meth_interp` is used to resample  into high-resolution
// not suggest 'biculic'. bicubic can't constrain values in reasonable boundary.
var meth_interp = 'bilinear'; // or 'bicubic'; for meteometeorological forcing spatial interpolatation
var filter_date_all = ee.Filter.date('2002-07-01', '2019-12-31');

// var mean_albedo = imgcol_albedo.select(0).mean().multiply(0.001), // multiple year mean
//     mean_emiss = imgcol_emiss.select(0).mean().expression('b() * 0.002 + 0.49'); // multiple year mean
// var land_mask = mean_emiss.mask(); // mask lead to export error, unknow reason

function is_empty_dict(x){
    return Object.keys(x).length === 0;
}

pkg_forcing.dataset = {};
pkg_forcing.init_dataset = function() {
    if (!is_empty_dict(pkg_forcing.dataset)) return;
    // var I_interp = true; // whether Interpolate MODIS LAI, Emissivity and Albedo
    // `meth_interp` is used to resample  into high-resolution
    // not suggest 'biculic'. bicubic can't constrain values in reasonable boundary.
    
    var filter_date_all = ee.Filter.date('2002-07-01', '2019-12-31');
    /** fix MCD12Q1_006 land cover code. */
    var ImgCol_land = imgcol_land.select(0).map(function (land) {
        //for MCD12Q1_006 water and unc type is inverse
        land = land.remap([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
            [17, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 0]);
        return (land);
    });

    // var land = ee.Image(ImgCol_land.first());
    // Map.addLayer(land);
    // var mean_albedo = imgcol_albedo.select(0).mean().multiply(0.001), // multiple year mean
    //     mean_emiss = imgcol_emiss.select(0).mean().expression('b() * 0.002 + 0.49'); // multiple year mean
    // var land_mask = mean_emiss.mask(); // mask lead to export error, unknow reason

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
    
    var imgcol_lai;
    /** 1.2 MODIS products: LAI, Albedo, Emissivity  */
    if (I_interp) {
        imgcol_lai = require('users/kongdd/gee_PML:src/mosaic_LAI.js').smoothed
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
    
    pkg_forcing.dataset = {
        ImgCol_land  : ImgCol_land, 
        ImgCol_gldas : ImgCol_gldas,
        // ImgCol_co2   : ImgCol_co2, 
        imgcol_lai   : imgcol_lai,
        imgcol_emiss : imgcol_emiss, 
        imgcol_albedo: imgcol_albedo,
    };
};

function updateYear(date, year){
    date = ee.Date(date);
    year = ee.Number(year);
    var doy  = date.difference(ee.Date.fromYMD(date.get('year').subtract(1), 12, 31), 'day');
    
    var date2 = year.format('%d').cat(doy.format('%03d'));
    date2 = ee.Date.parse('yyyyDDD', date2);
    return date2;
}

/**
 * Prepare INPUT datset for PML_V2
 *
 * @param {[type]} begin_year [description]
 * @param {[type]} end_year   [description]
 */
pkg_forcing.PML_INPUTS_d8 = function(begin_year, end_year, options) {
    options = options || {};
    if (options.is_dynamic_lc === undefined) options.is_dynamic_lc = true;
    if (is_empty_dict(pkg_forcing.dataset)) pkg_forcing.init_dataset();
    
    if (typeof end_year === 'undefined') { end_year = begin_year; }
    begin_year = ee.Number(begin_year);
    end_year = ee.Number(end_year);

    var begin_yearStr = begin_year.format('%d'),
        end_yearStr = end_year.format('%d');
    var date_begin = ee.Date(ee.Algorithms.If(begin_year.eq(ee.Number(2002)),
        begin_yearStr.cat("-07-01"), begin_yearStr.cat("-01-01"))),
        date_end = ee.Date(end_yearStr.cat("-12-31"));
    var filter_date = ee.Filter.date(date_begin, date_end);
    
    var filter_date_static2003 = ee.Filter.date('2003-01-01', '2003-12-31');
    var filter_date_modis = (options.is_dynamic_lc) ? filter_date : filter_date_static2003;
    // print(date_begin, date_end);

    /** MODIS LAI, Albedo, Emiss */
    // var miss_date = ee.Date('2003-12-19'); //replaced with 2003-12-23
    // var lai_miss  = imgcol_lai.filterDate('2003-12-22', '2003-12-24')
    //     .map(function(img){ return pkg_main.setImgProperties(img, miss_date); })
    //     .sort("system:time_start");

    /** 4-day to 8-day */
    var LAI_d4 = pkg_forcing.dataset.imgcol_lai.filter(filter_date_modis);//.merge(lai_miss);
    LAI_d4 = LAI_d4.map(pkg_trend.add_dn(true, 8));
    // print(imgcol_lai);
    var LAI_d8 = pkg_trend.aggregate_prop(LAI_d4, 'dn', 'mean').select([0], ['LAI']);
    LAI_d8 = LAI_d8.map(function (img) {
        var datestr = img.get('dn');
        var date = pkg_trend.YearDn_date(datestr);
        return img.updateMask(img.gte(0)).unmask(0)
            .set('system:time_start', date.millis()); //.mask(land_mask); // LAI[LAI < 0] <- 0
    });

    var Albedo_d8 = pkg_forcing.dataset.imgcol_albedo.filter(filter_date_modis);
    var Emiss_d8 = pkg_forcing.dataset.imgcol_emiss.filter(filter_date_modis);

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

    var gldas_input = pkg_forcing.dataset.ImgCol_gldas.filter(filter_date);
    if (meth_interp === 'bilinear' || meth_intterp === 'bicubic') {
        gldas_input = gldas_input.map(function (img) {
            return img.resample(meth_interp).copyProperties(img, img.propertyNames());
        });
    }
    
    if (!options.is_dynamic_lc) {
        // Update Year
        modis_input = modis_input.map(function(img){
            var date = img.get('system:time_start');
            date = updateYear(date, begin_year);
            img = img.set('system:time_start', date.millis());
            return img;
        });    
    }
    var pml_input = pkg_join.InnerJoin(modis_input, gldas_input).sort("system:time_start");
    // Map.addLayer(pml_input, {}, 'pml_input');
    // Map.addLayer(modis_input, {}, 'modis_input');
    return ee.ImageCollection(pml_input);
};

exports = pkg_forcing;

var debug;// = true; //false;
// var debug = true;
if (debug) {
    var year = 2003;
    var INPUTS = pkg_forcing.PML_INPUTS_d8(year, 2005, {is_dynamic_lc: false});
    // not that PML_INPUTS_d8 has the parameter `is_dynamic_lc`
    // var INPUTS = pkg_forcing.PML_INPUTS_d8(year, 2005);
    print(INPUTS);
}
