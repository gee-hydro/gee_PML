/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var imgcol_lai = ee.ImageCollection("MODIS/006/MCD15A3H"),
    poly = ee.FeatureCollection("users/kongdd/shp/TP/TP_poly");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
// var pkg_whit   = require('users/kongdd/pkgs:Math/Whittaker.js');
var pkg_main   = require('users/kongdd/public:pkg_main.js');
var pkg_smooth = require('users/kongdd/public:Math/pkg_smooth.js');
var pkg_join   = require('users/kongdd/public:pkg_join.js');
var pkg_vis    = require('users/kongdd/public:pkg_vis.js');
// print(poly.geometry())
/** Initial parameters for whittaker smoother */
var lambda = 500;
var year_begin = 2016,
    year_end   = year_begin + 3,
    date_begin = ee.Algorithms.If(ee.Number(year_begin).eq(2002), '2002-07-01', year_begin.toString().concat('-01-01')),
    date_end   = year_end.toString().concat('-12-31');
    
print(date_begin, date_end);
var imgcol_lai = imgcol_lai.filterDate(date_begin, date_end); //.select('Lai');
// mask is really important for dimension consistency
var mask       = imgcol_lai.select('Lai').mosaic().mask(); 
var imgcol     = imgcol_lai;

var palette = ['#570088', '#920057', '#CE0027', '#FF0A00', '#FF4500', '#FF8000', '#FFB100', '#FFD200', '#FFF200', '#C7EE03', '#70D209', '#18B80E', '#067F54', '#033FA9', '#0000FF'];
var vis     = { min: 0.0, max: 50.0, palette: palette.reverse(), bands: 'Lai'};
Map.addLayer(imgcol, vis, 'LAI');
pkg_vis.grad_legend(vis, 'LAI*10');
// print(imgcol);

var iters = 2,
    task  = 'whit_'.concat(year_begin).concat('_').concat(year_end);
    
var nrow  = imgcol.size(),
    ncol  = iters, 
    bands,
    dates = ee.List(imgcol.aggregate_array('system:time_start'));

var points = require('users/kongdd/public:data/flux_points.js').points;
// points = points.limit(80);    
var points_buf = points.map(function(f) {return ee.Feature(f).buffer(500)});
var point = ee.Feature(points.first()).geometry();

////////////////////////////////////////////////////////////////////////////

function qc_LAI(img) {
    var FparLai_QC   = img.select('FparLai_QC');
    var FparExtra_QC = img.select('FparExtra_QC');
    
    var qc_scf       = FparLai_QC.bitwiseAnd(224).divide(32); //bit5-7, 1110 0000, shift 5
    
    var qc_snow      = FparExtra_QC.bitwiseAnd(4).divide(4); //bit2, snow or ice
    var qc_aerosol   = FparExtra_QC.bitwiseAnd(8).divide(8); //bit3 
    var qc_cirrus    = FparExtra_QC.bitwiseAnd(16).divide(16); //bit4
    var qc_cloud     = FparExtra_QC.bitwiseAnd(32).divide(32); //bit5
    var qc_shadow    = FparExtra_QC.bitwiseAnd(64).divide(64); //bit6
   
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

////////////////////////////////////////////////////////////////
var count = imgcol_lai.select('Lai').count();
var temp  = count.eq(0).and(mask.not());
// Map.addLayer(count, {}, 'count');
// Map.addLayer(temp , {}, 'temp');
// Map.addLayer(mask , {}, 'mask');

imgcol = imgcol.map(function(img) {
    img = img.unmask(-1.0);
    return ee.Image(qc_LAI(img)).updateMask(mask);
});
// Map.addLayer(imgcol, {}, 'imgcol');
// imgcol = imgcol.select('Lai');
/**
 * A recursive function used to get D matrix of whittaker Smoother
 * 
 * @references
 * Paul H. C. Eilers, Anal. Chem. 2003, 75, 3631-3636
 */
function diff_matrix(array, d) {
    array = ee.Array(array); //confirm variable type
    var diff = array.slice(0, 1).subtract(array.slice(0, 0, -1));
    if (d > 1) {
        diff = diff_matrix(diff, d - 1);
    }
    return diff;
}

/**
 * whitsm_ImgCol
 *
 * Whittaker Smooth function for ImageCollection
 *
 * @param  {ImageCollection} ImgCol The Input time-series.
 * @param  {Integer}         order  The order of difference.
 * @param  {Integer}         lambda The smooth parameter, a large value mean much smoother.
 * @return {ImageCollection}        [description]
 */
function whit_imgcol(imgcol, order, lambda, iters) {
    // iters  = iters  || 2;
    // order  = order  || 2;
    // lambda = lambda || 2;
    if (typeof iters  === 'undefined') { iters = 2; }
    if (typeof order  === 'undefined') { order = 2; }
    if (typeof lambda === 'undefined') { lambda = 2; }

    // print(imgcol);
    
    lambda = ee.Number(lambda);
    // print(w.getInfo())
    var n    = imgcol.size();
    var ymat = imgcol.select(0).toArray(); //2d Column Image vector, .toArray(1)
    var w    = imgcol.select(1).toArray(); //2d Column Image vector, .toArray(1)
    // var w1 = pkg_smooth.setweights(imgcol.select(0));
    
    // Map.addLayer(ymat, {}, 'ymat');
    
    // print(w, w1, 'w & w1');
    // imgRegions(ymat, points, 'y')
    // 1. Whittaker matrix calculation 
    var E = ee.Array.identity(n);
    var D = diff_matrix(E, order);
    var D2 = ee.Image(D.transpose().matrixMultiply(D).multiply(lambda));
    
    var W, C, z, re,
        imgcol_z;
    var zs = ymat, 
        ws = w;
    
    for (var i = 1; i <= iters; i++) {
        W  = ee.Image(w).matrixToDiag(); //ee.Image(E) ;//
        // C = W.add(D2).matrixCholeskyDecomposition().arrayTranspose(); //already img array
        // z  = C.matrixSolve(C.arrayTranspose().matrixSolve(w.multiply(ymat)));
        // z  = ymat.where(mask, C.matrixSolve(C.arrayTranspose().matrixSolve(w.multiply(ymat))));
        // var temp = W.add(D2);
        // z  = R.matrixInverse().matrixMultiply(Q.matrixTranspose()).matrixMultiply(w.multiply(ymat));
        z  = W.add(D2).matrixSolve(w.multiply(ymat));
        // pkg_main.imgRegions(w, points, 'w');
        // pkg_main.imgRegions(W, points, 'temp');
        // pkg_main.imgRegions(z, points, 'z');
        
        var T_imgcol = false;
        if (T_imgcol){
            // second solution
            imgcol_z = pkg_main.array2imgcol(z, nrow, 1, ['z'], dates);
            // print(imgcol_z);
            re = pkg_join.ImgColFun(imgcol.select(0), imgcol_z, pkg_join.Img_absdiff);
            // imgcolRegions(re, 're')
            w  = pkg_smooth.modweight_bisquare(re);
        }else{
            // first solution
            re = z.subtract(ymat);
            w  = pkg_smooth.wBisquare_array(re, w);
            // imgRegions(re, 're')
        }
        // Map.addLayer(z, {}, 'z');
        // imgRegions(w , 'w')
        zs = zs.arrayCat(z, 1);
        ws = ws.arrayCat(w, 1);
    }
    // 2. Image Array transform into ImgCol
    // return ImgCol_whit;
    return {zs:ee.Image(zs), ws:ee.Image(ws)}; //, C:C
}

var datelist = ee.List(imgcol.aggregate_array('system:time_start')).map(function(x) {
    return ee.Date(x).format('YYYY_MM_dd');
});

var ids = datelist.map(function(val){
    return ee.String('b').cat(val);
});
// print(ids);

var whit    = whit_imgcol(imgcol, 2, lambda);
var mat_zs  = whit.zs;
var mat_ws  = whit.ws;

var img_out = mat_zs.arraySlice(1, -1).arrayProject([0]).arrayFlatten([ids]);//only select the last iter
img_out = img_out.multiply(10).uint8();
// print(img_out);
// BufferPoints(ImgCol, points, distance, reducer, scale, list, save, file, folder);
// var val = ee.Image(mat_out).reduceRegion({reducer:ee.Reducer.toList(), geometry:point, scale:500});
//crs, crsTransform,
var dict_whit = pkg_main.imgRegions(mat_zs, points);
// print(dict_whit);

// export_array(mat_zs, 'mat_out368');//points, 
// Map.addLayer(mat_zs, {}, 'mat_zs');

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
        
// var imgcol_whit = array2imgcol(whit.zs, nrow, ncol+1, bands, dates);
// var imgcol_ws   = array2imgcol(whit.ws, nrow, ncol+1, bands, dates);

var panel = ui.Panel();
// panel.style().set('width', '600px');

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


// imgcol_whit = imgcol_whit.arrayProject([0]).arrayFlatten([ids]); //.clip(mask);

// Map.addLayer(imgcol     , {}, 'ImgCol');
// Map.addLayer(imgcol_whit, {}, 'ImgCol_whit');
// Map.addLayer(imgcol_ws  , {}, 'imgcol_ws');
// Map.addLayer(imgcol_whit.mask(), {}, 'ImgCol_whit mask');

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


function select_OnChange(value){
    var point = ee.Feature(points.filterMetadata('site', 'equals', value).first()).geometry(); //ee.Filter.eq('site', value)
    // print(point);
    Map.centerObject(point, 14);

    var arraylist = ee.Array(mat_zs.sample(point, 500).first().get('array')); 
    // var arraylist = ee.Array(ee.List(ee.Dictionary(dict_whit).get(value)).get(0));

    //var p_whit = show_series(imgcol_whit, 'imgcol_whit', point),
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

function show_arrayseries(arraylist,title,region){
    if (typeof region === 'undefined') {
        region = ee.Feature(points.first());
    }
    var Names = ['raw','iter1','iter2'];
    var p = ui.Chart.array.values({
        array: arraylist,
        axis : 0,
        xLabels: datelist,
    }).setOptions({
      title: title,
      series: { 
          0: { lineWidth: 0, pointSize: 2},
          1: { lineWidth: 2, pointSize: 0 },
          2: { lineWidth: 2, pointSize: 0 }
      }}).setSeriesNames(Names);
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
    // if (IsPrint) {
    //     print(tool);
    // } else {
    //     return tool;
    // }
}

var pkg_export = require('users/kongdd/public:pkg_export.js');

/** designed to export regional (poly) data */
function export_img(img, folder, task){
    // var val = imgRegions(mat, file); 
    Export.image.toAsset({
          image : img,
          description: task,
          assetId: folder.concat('/').concat(task), //projects/pml_evapotranspiration/
          crs   : crs,
          region: poly,
          scale :500,
          // dimensions: dimensions,
          maxPixels: 1e13
    });  
}

var range      = [-180, -60, 180, 90], //
    range_high = [-180,  60, 180, 90], //
    scale = 1 / 240,
    drive = false,
    folder = 'projects/pml_evapotranspiration/LAI_whit_4d',
    crs = 'SR-ORG:6974';
    // task = 'whit-4y';

// Map.addLayer(img_out, {}, 'img_out');
// pkg_export.ExportImg_deg(img_out, range     , task, scale, drive, folder, crs);
// pkg_export.ExportImg_deg(img_out, range_high, task.concat('_high'), scale, drive, folder, crs);

// export_img(img_out, folder, task);

// print(img_out)
// pkg_export.ExportImgCol(img_out, undefined, range, scale, drive, folder, crs);
////////////////////////////////////////////////////////////////////////////////

exports = {
    // whitsm_points: whitsm_points,
    // whitsm_ImgCol: whitsm_ImgCol,
};
