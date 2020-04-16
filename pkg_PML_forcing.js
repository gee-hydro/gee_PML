var pkg_forcing = {};
// var pkg_forcing = require('users/kongdd/gee_PML:pkg_PML_forcing.js');
var pkg_join = require('users/kongdd/public:pkg_join.js');

// /**** Start of imports. If edited, may not auto-convert in the playground. ****/
var point = /* color: #d63000 */ee.Geometry.Point([-118.01513671875, 38.11727165830543]),
    ImgCol_gldas = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/GLDAS_V21_8day_V2"),
    imgcol_albedo = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/Albedo_interp_8d_v2"),
    imgcol_emiss = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/Emiss_interp_8d"),
    imgcol_lai_4d = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/LAI_whit_4d"),
    imgcol_land = ee.ImageCollection("MODIS/006/MCD12Q1"),
    co2 = ee.FeatureCollection("projects/pml_evapotranspiration/PML_INPUTS/co2_mm_gl_2002-2019_8day");
// /***** End of imports. If edited, may not auto-convert in the playground. *****/

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

/**
 * Prepare INPUT datset for PML_V2
 *
 * @param {[type]} begin_year [description]
 * @param {[type]} end_year   [description]
 */
pkg_forcing.PML_INPUTS_d8 = function(begin_year, end_year) {
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

exports = pkg_forcing;

var debug = true;
var debug;// = true; //false;
if (debug) {
    var INPUTS = pkg_forcing.PML_INPUTS_d8(year);
    print(INPUTS)
}
