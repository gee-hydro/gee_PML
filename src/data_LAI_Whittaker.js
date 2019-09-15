/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var imgcol_lai = ee.ImageCollection("MODIS/006/MCD15A3H"),
    poly = ee.FeatureCollection("users/kongdd/shp/TP/TP_poly");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
/** 
 * This script is to fill gaps of MODIS 4-day LAI with the methods of 
 * weighted Whittaker with constant lambda
 * 
 * # 2018-04-25, Dongdong Kong (in pkgs/Math/Whittaker.js)
 * lambda = 500 (or 700) for 2-3 (or 4) years 4-day LAI images
 * 
 * # 2019-08-02, Dongdong Kong
 * Update for PML_V2 2018 images
 * lambda = 50 (or 20) for 2018 (or 20190101-20190902)
 *
 * Copyright (c) 2019 Dongdong Kong
 * 
 * @references
 * 1. Kong, D., Zhang, Y., Gu, X., & Wang, D. (2019). A robust method
 *     for reconstructing global MODIS EVI time series on the Google Earth Engine.
 *     *ISPRS Journal of Photogrammetry and Remote Sensing*, *155*(May), 13–24.
 *     https://doi.org/10.1016/j.isprsjprs.2019.06.014
 * 2. Zhang, Y., Kong, D., Gan, R., Chiew, F.H.S., McVicar, T.R., Zhang, Q., and 
 *     Yang, Y.. (2019) Coupled estimation of 500m and 8-day resolution global 
 *     evapotranspiration and gross primary production in 2002-2017. 
 *     Remote Sens. Environ. 222, 165-182, https://doi:10.1016/j.rse.2018.12.031 
 */
var pkg_main   = require('users/kongdd/public:pkg_main.js');
var pkg_smooth = require('users/kongdd/public:Math/pkg_smooth.js');
var pkg_join   = require('users/kongdd/public:pkg_join.js');
var pkg_vis    = require('users/kongdd/public:pkg_vis.js');
var pkg_whit   = require('users/kongdd/public:Math/pkg_whit.js');

/** GLOBAL FUNCTIONS -------------------------------------------------------- */
var date2str = function(x) { return ee.Date(x).format('YYYY_MM_dd'); };
/** ------------------------------------------------------------------------- */

// MAIN SCRIPT 
{
    /** Initial parameters for whittaker smoother --------------------------- */
    var lambda = 50;
    var year_begin = 2018,
        year_end   = 2018, // year_beggin,
        date_begin = year_begin == 2002 ? '2002-07-01' : year_begin.toString().concat('-01-01'),
        date_end   = year_end.toString().concat('-12-31');
    
    print(date_begin, date_end);
    var imgcol_lai = imgcol_lai.filterDate(date_begin, date_end); //.select('Lai');
    // mask is really important for dimension consistency
    var mask       = imgcol_lai.select('Lai').mosaic().mask(); 
    var imgcol     = imgcol_lai;
    
    /** 1. pre-process mask NA values and init weights */
    imgcol = imgcol.map(function(img) {
        img = img.unmask(-1.0);
        return ee.Image(qc_LAI(img)).updateMask(mask);
    });

    /** 2. Whittaker smoother ------------------------------------------------------ */
    var options_whit = {
        order        : 2,    // difference order
        wFUN         : pkg_whit.wBisquare_array, // weigths updating function
        iters        : 2,    // Whittaker iterations
        min_ValidPerc: 0,    // pixel valid ratio less then `min_ValidPerc`, is not smoothed.
        min_A        : 0.02, // Amplitude A = ylu_max - ylu_min, points are masked if 
                             // A < min_A. If ylu not specified, min_A not work
        missing      : -0.05 // Missing value in band_sm are set to missing.
        // matrixSolve = 1;  // whittaker, matrix solve option:
        // 1:matrixSolve, 2:matrixCholeskyDecomposition, 3:matrixPseudoInverse 
    };
    
    var whit    = pkg_whit.whit_imgcol(imgcol, options_whit, lambda);
    var mat_zs  = whit.zs;
    var mat_ws  = whit.ws;
    
    /** 3. convert 2d array into multi-bands -------------------------------- */    
    var datelist = ee.List(imgcol.aggregate_array('system:time_start')).map(date2str);
    var ids = datelist.map(function(val){ return ee.String('b').cat(val); }); // print(ids);

    var img_out = mat_zs.arraySlice(1, -1).arrayProject([0]).arrayFlatten([ids]);//only select the last iter
    img_out = img_out.multiply(10).uint8();
    
    Map.addLayer(img_out, {}, 'img_out')

    /** 4. EXPORT ----------------------------------------------------------- */
    var pkg_export = require('users/kongdd/public:pkg_export.js');
    var range      = [-180, -60, 180, 90], //
        range_high = [-180,  60, 180, 90], //
        cellsize   = 1 / 240,
        type       = 'asset',
        folder     = 'projects/pml_evapotranspiration/PML_INPUTS/MODIS/LAI_whit_4d',
        crs        = 'SR-ORG:6974';
    var task       = 'whit_'.concat(year_begin).concat('_').concat(year_end);
    
    var prj     = pkg_export.getProj(imgcol_lai); 
    var options = {
        crsTransform: prj.crsTransform, 
        folder: "projects/pml_evapotranspiration/PML_INPUTS/MODIS/LAI_whit2018", 
        tile_nx: 5, 
        tile_ny: 2
    };
    print(options, 'options');
    var range     = [-180, -60, 180, 90];
    // range = [70, 15, 140, 25];
    print(prj, img_out);
    // Map.addLayer(img_out, {}, 'img_out');
    // exportTiles(img_out, '2018_lambda50', range, options);
    pkg_export.ExportImg(img_out, task, range, cellsize, type, folder, prj.crs, prj.crsTransform);
    // pkg_export.ExportImg(img_out, range_high, task.concat('_high'), scale, drive, folder, crs);
    // pkg_export.ExportImgCol(img_out, undefined, range, scale, drive, folder, crs);
}

/** Visualization ------------------------------------------------------------- */
var palette = ['#570088', '#920057', '#CE0027', '#FF0A00', '#FF4500', '#FF8000', '#FFB100', '#FFD200', '#FFF200', '#C7EE03', '#70D209', '#18B80E', '#067F54', '#033FA9', '#0000FF'];
var vis     = { min: 0.0, max: 50.0, palette: palette.reverse(), bands: 'Lai'};
// Map.addLayer(imgcol, vis, 'LAI');
pkg_vis.grad_legend(vis, 'LAI*10');
// print(imgcol);
// var nrow  = imgcol.size(), ncol  = iters,  bands,
// var dates = ee.List(imgcol.aggregate_array('system:time_start'));
// Map.addLayer(imgcol, {}, 'imgcol');
// imgcol = imgcol.select('Lai');
// export_img(img_out, folder, task);

/** ------------------------------------------------------------------------- */
// var val = ee.Image(mat_out).reduceRegion({reducer:ee.Reducer.toList(), geometry:point, scale:500});
var points = require('users/kongdd/public:data/flux_points.js').points;
// points = points.limit(80);    
var points_buf = points.map(function(f) {return ee.Feature(f).buffer(500)});
var point = ee.Feature(points.first()).geometry();

var dict_whit = pkg_main.imgRegions(mat_zs, points);
// print(dict_whit);
// export_array(mat_zs, 'mat_out368');//points, 
// Map.addLayer(mat_zs, {}, 'mat_zs');

/** Initialize weights ------------------------------------------------------ */
function qc_LAI(img) {
    var FparLai_QC   = img.select('FparLai_QC');
    var FparExtra_QC = img.select('FparExtra_QC');
    
    var qc_scf       = pkg_main.getQABits(FparLai_QC, 5, 7); //bit5-7, 1110 0000, shift 5
    var qc_snow      = pkg_main.getQABits(FparLai_QC, 2); //bit2, snow or ice
    var qc_aerosol   = pkg_main.getQABits(FparLai_QC, 3); //bit3 
    var qc_cirrus    = pkg_main.getQABits(FparLai_QC, 4); //bit4
    var qc_cloud     = pkg_main.getQABits(FparLai_QC, 5); //bit5
    var qc_shadow    = pkg_main.getQABits(FparLai_QC, 6); //bit6
   
    /**
     * items               | weights
     * --------------------|--------
     * snow, cloud, shadow | 0
     * aerosol, cirrus     | 0.5
     */
    var w        = img.select(0).mask(); //unknow why can use ee.Image(1)
    var q_0      = qc_snow.or(qc_cloud).or(qc_shadow);
    var q_1      = qc_aerosol.or(qc_cirrus);
    
    w = w.where(q_1, 0.5).where(q_0, 0.05);
    // var img2    = img.select('Lai').updateMask(qc_mask).divide(5);
    return ee.Image(img.select('Lai')).divide(10)
        .addBands([w, qc_scf, qc_snow, qc_aerosol, qc_cirrus, qc_cloud, qc_shadow])
        .rename(['Lai', 'w', 'qc_scf', 'qc_snow', 'qc_aerosol', 'qc_cirrus', 'qc_cloud', 'qc_shadow'])
        .copyProperties(img, img.propertyNames());
}

function export_array(mat, file){
    // mat = mat.arraySlice(1, -1);
    var val = imgRegions(mat, points, file); 
    Export.table.toDrive({
        collection : val, //.flatten(),
        description: file,
        folder     : '',
        fileFormat : 'GeoJSON' //GeoJSON, CSV
    });
}

var panel = ui.Panel();
// panel.style().set('width', '600px');replace_mask
var app = {
    show: function(){
        // basemap
        Map.addLayer(points    , {}, 'points');
        Map.addLayer(points_buf, {}, 'points_buf');

        var tool = InitSelect(true);
        print(panel);
        // ui.root.insert(0, panel);
    }
};
app.show();

function select_OnChange(value){
    var point = ee.Feature(points.filterMetadata('site', 'equals', value).first()).geometry(); //ee.Filter.eq('site', value)
    // print(point);
    Map.centerObject(point, 14);

    var arraylist = ee.Array(mat_zs.sample(point, 500).first().get('array')); 
    // var arraylist = ee.Array(ee.List(ee.Dictionary(dict_whit).get(value)).get(0));
    // var p_whit = show_series(imgcol_whit, 'imgcol_whit', point),
        //p_ws   = show_series(imgcol_ws  , 'imgcol_ws', point);
    var p_whit = show_arrayseries(arraylist, 'imgcol_whit', point);
    // var p_whit = show_series(imgcol_whit, 'imgcol_whit', point),
    //     p_ws   = show_series(imgcol_ws  , 'imgcol_ws', point);
    // print(panel.widgets());
    // panel.widgets().set(1, p_ws);
    panel.widgets().set(1, p_whit);
}

function show_series(imgcol, title, region){
    if (typeof region === 'undefined') {
        region = ee.Feature(points.first());
    }
    var p = ui.Chart.image.series({
        imageCollection: imgcol, 
        region: region, 
        reducer: ee.Reducer.mean(), 
        // band:0, 
        scale:500, 
        // xProperty,
        // seriesProperty:'site'
    }).setOptions({title: title});
    return p;
}

function show_arrayseries(arraylist, title, region){
    if (typeof region === 'undefined') {
        region = ee.Feature(points.first());
    }
    // var Names = ['raw', Array(nrow-1).join().split(',').map(function(e, i) { return 'iter'.concat(i+1); })];
    /** setting items name and point & line shape*/
    var n = options_whit.iters;
    var xs = pkg_main.seq_len(n+1);
    var Names = xs.map(function(i) {return 'iter'.concat(i); }); 
    Names[0] = 'raw';
    
    var series = xs.reduce(function(obj, i){ 
        obj[i] = { lineWidth: 2, pointSize: 0}; return obj;
    }, {});
    series[0] = { lineWidth: 0, pointSize: 2};
    // -------------------------------------------
    var p = ui.Chart.array.values({
        array: arraylist,
        axis : 0,
        xLabels: datelist,
    }).setOptions({
      title: title,
      series: series}).setSeriesNames(Names);
    return p;
}

function InitSelect(IsPrint){
    if (typeof IsPrint === 'undefined') { IsPrint = false; }
    
    var FeaCol = points,
        name = 'site';
    FeaCol = FeaCol.sort(name);
    var names = FeaCol.aggregate_array(name).getInfo();

    var tool = ui.Select({ items: names, onChange: select_OnChange });
    panel.add(tool);
    tool.setValue(names[0]);
    // if (IsPrint) { print(tool); } else {
    //     return tool;
    // }
}

/** designed to export regional (poly) data */
function export_img(img, folder, task){
    // var val = imgRegions(mat, file); 
    Export.image.toAsset({
          image      : img,
          description: task,
          assetId    : folder.concat('/').concat(task), //projects/pml_evapotranspiration/
          crs        : crs,
          region     : poly,
          scale      : 500,
          // dimensions: dimensions,
          maxPixels  : 1e13
    });  
}

var pkg_export   = require('users/kongdd/public:pkg_export.js');

/** 
 * split exporting range into multiple piece
 *
 * @param {[type]} range  [description]
 * @param {[type]} nx     [description]
 * @param {[type]} ny     [description]
 * @param {[type]} prefix [description]
 *
 * @examples
 * var range  = [-180, -60, 180, 90];
 * var ranges = SplitGrids(range, 2, 2, "prefix_"); 
 * print(ranges);
 * ranges.forEach(function(dict, ind){
 *     pkg_export.ExportImg(img_out, dict.range, dict.file, 1/240, 'drive', "");
 * });
 */
function SplitGrids(range, nx, ny, prefix) {
    nx = nx || 4;
    ny = ny || nx;
    prefix = prefix || "";

    var lat_range = range[3] - range[1],
        lon_range = range[2] - range[0],
        dy = lat_range / ny,
        dx = lon_range / nx;
    // print(lon_range, lat_range, dx, dy);

    var file, range_ij, lat_min, lat_max, lon_min, lon_max;
    var tasks = [],
        task;
    for (var i = 0; i < nx; i++) {
        lon_min = range[0] + i * dx;
        lon_max = lon_min + dx;
        for (var j = 0; j < ny; j++) {
            lat_min = range[1] + j * dy;
            lat_max = lat_min + dy;

            range_ij = [lon_min, lat_min, lon_max, lat_max];
            file = prefix + i.toString() + '_' + j.toString();
            tasks.push({ range: range_ij, file: file });
            // print(file, range_ij);
        }
    }
    return tasks;
}

/** Export Global tiles */
function exportTiles(img_out, task, range, options){
    var postfix = options.postfix || "";
    var folder  = options.folder  || "";
    var crs     = options.crs     || 'SR-ORG:6974';
    var crsTransform = options.crsTransform || "";
    var tile_nx = options.tile_nx;
    var tile_ny = options.tile_ny;
    
    var ranges = SplitGrids(range, tile_nx, tile_ny, task+"_"); 
    print(ranges);
    ranges.forEach(function(dict, ind){
        // pkg_export.ExportImg_deg(img_out, dict.file+postfix, dict.range, cellsize, 'asset', folder);
        // pkg_export.ExportImg_deg(img_out, dict.file+postfix, dict.range, cellsize, 
        //     'asset', folder, crs, crsTransform); //, crsTransform
        // print(crs, crsTransform, 'here')
        var region = ee.Geometry.Rectangle(dict.range, 'EPSG:4326', false);
        var param = {
            image       : img_out, 
            description : dict.file+postfix, 
            assetId     : folder + '/' + dict.file+postfix, 
            // dimensions  : pkg_export.getDimensions(dict.range, cellsize),
            crs         : crs,
            crsTransform: crsTransform, 
            region      : region,
            maxPixels   : 1e12
        };
        // print(param, 'tilesExportParam');
        Export.image.toAsset(param); //image, , pyramidingPolicy, dimensions:'86400x36000', region, scale, crs, crsTransform, maxPixels)
    });
}

// var p = ui.Chart.image.seriesByRegion({
//     imageCollection: imgcol, 
//     regions:points.limit(3),//ee.Feature(points.first()), 
//     reducer: ee.Reducer.mean(), 
//     band:0, 
//     scale:500, 
//     // xProperty,
//     seriesProperty:'site'
// }).setOptions({title: 'original'});
// print(p);
// print('d1');
// print(imgcol_whit);
////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////
// var count = imgcol_lai.select('Lai').count();
// var temp  = count.eq(0).and(mask.not());
// Map.addLayer(count, {}, 'count');
// Map.addLayer(temp , {}, 'temp');
// Map.addLayer(mask , {}, 'mask');
        
// var imgcol_whit = pkg_main.array2imgcol(whit.zs, nrow, ncol+1, bands, dates);
// var imgcol_ws   = pkg_main.array2imgcol(whit.ws, nrow, ncol+1, bands, dates);
// imgcol_whit = imgcol_whit.arrayProject([0]).arrayFlatten([ids]); //.clip(mask);
// Map.addLayer(imgcol     , {}, 'ImgCol');
// Map.addLayer(imgcol_whit, {}, 'ImgCol_whit');
// Map.addLayer(imgcol_ws  , {}, 'imgcol_ws');
// Map.addLayer(imgcol_whit.mask(), {}, 'ImgCol_whit mask');
