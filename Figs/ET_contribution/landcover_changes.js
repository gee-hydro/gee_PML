/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var imgcol_land = ee.ImageCollection("MODIS/006/MCD12Q1"),
    point = /* color: #d63000 */ee.Geometry.Point([120.32309084261419, 30.179352325549885]),
    imgcol_lc_perc = ee.ImageCollection("projects/pml_evapotranspiration/PML/OUTPUT/TREND/landcover_perc_G025");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
imgcol_land = imgcol_land.select(0);

var cellsize    = 1/240;  
var targetScale = 1/4;

var lc_names_006 = ["UNC", "ENF", "EBF", "DNF", "DBF", "MF", "CSH",
                "OSH", "WSA", "SAV", "GRA", "WET", "CRO",
                "URB", "CNV", "SNO", "BSV", "water"];

////////////////////////////////////////////////////////////////////////////////
var cal_count = function(img){
    var count = 
        img
        .reproject(ee.Projection('EPSG:4326').scale(cellsize, cellsize))
        .reduceResolution({ reducer: ee.Reducer.fixedHistogram(0, 18, 18), maxPixels: 65536})
        .reproject(ee.Projection('EPSG:4326').scale(targetScale, targetScale));
    count = count.arraySlice(1, 1)
        .arrayProject([0])
        .arrayFlatten([lc_names_006])
        .multiply(100)
        .copyProperties(img, img.propertyNames());
        
    return count;
};

function reclass(img){
    var img_Crop = img.select(["CRO", "CNV"]).reduce('sum').rename('Crop');
    var img_Forest = img.select(["ENF", "EBF", "DNF", "DBF", "MF"]).reduce('sum').rename('Forest');
    var img_Shrub  = img.select(["CSH", "OSH", "WSA"]).reduce('sum').rename('Shrub');
    var img_Water  = img.select(["SNO", "water"]).reduce('sum').rename('Water');
    var img_Others = img.select(["BSV", "UNC"]).reduce('sum').rename('Others');
    
    return img.addBands([img_Crop, img_Forest, img_Shrub, img_Water, img_Others]);  
}

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
var imgcol_land = imgcol_land.select(0).map(function(land){
    //for MCD12Q1_006 water and unc type is inverse
    // land = land.remap([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17], 
    //     [17, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 0]); 
    var mask = land.expression("b() == 0 || b() == 17").not();
    land = land.rename('land')
        .updateMask(mask);
    return(land);
});


// var img = imgcol_land.first();

// var imgcol_count = imgcol_land.map(cal_count);
// var count = cal_count(img);
// print(imgcol_count);

var imgcol_count = imgcol_lc_perc;

var img_his = imgcol_count.filterDate('2011-01-01', '2017-01-02').mean();
var img_now = imgcol_count.filterDate('2003-01-01', '2009-01-02').mean();

var img_diff = img_his.subtract(img_now);
// var img_unc = imgcol_count.select('UNC').sum();

// Map.addLayer(img  , {min:0, max:1, palette: ["white","ff3c01"]}, 'ImgCol_land');
// Map.addLayer(imgcol_count, {min:0, max:1}, 'count');

var img = reclass(img_diff);
print(img);

var pkg_vis   = require('users/kongdd/public:pkg_vis.js');

var delta = 5;
var vis  = {min:-delta, max:delta, palette:["ff0d01","fafff5","2aff03"]};
var lg_slp = pkg_vis.grad_legend(vis, 'Change Perc (%)', false); //gC m-2 y-2

// print(img, 'debug1')
var bands = ['SNO', 'water']; //Others, 'Shrub' //'Crop', 'URB', 'GRA', 'Forest', 

var nmap = bands.length;
var maps = pkg_vis.layout(nmap);
// var maps = pkg_vis.layout(nmap, 3, 2);

var options = {
    // fullscreenControl: false, 
    // mapTypeControl   : false,
    zoomControl: false,
    // layerList  : false
};

maps.forEach(function(value, i) {
    // var img = imgcol.first().select('GPP');
    var lab_style = {fontWeight:'bold', fontSize: 36};
    
    var map = maps[i];
    map.setControlVisibility(options);
    var band = bands[i];
    map.addLayer(img.select(band), vis, band);
    map.widgets().set(3, ui.Label(band, lab_style));
});


// maps[1].addLayer(t_gpp, vis_gpp, labels[3]);
// maps[1].addLayer(imgcol_v2, {}, 'original data');
maps[1].add(lg_slp);


// Map.addLayer(img_diff, vis, 'count');
// Map.centerObject(point, 4);

/** EXPORT */
var pkg_export = require('users/kongdd/public:pkg_export.js');

// var prj = pkg_export.getProj(imgcol_gpp_mod);
var range     = [-180, -60, 180, 90],
    bounds    = ee.Geometry.Rectangle(range, 'EPSG:4326', false), //[xmin, ymin, xmax, ymax]
    cellsize  = 1 / 4, //1/240,
    type      = 'asset',
    folder    = 'projects/pml_evapotranspiration/PML/OUTPUT/TREND',
    crs       = 'EPSG:4326'; //projects/pml_evapotranspiration
    // crsTransform = prj.crsTransform;

// pkg_export.ExportImg(img_diff    , 'landcover_change_perc_G025', range, cellsize, type, folder, crs);
folder    = 'projects/pml_evapotranspiration/PML/OUTPUT/TREND/landcover_perc_G025';
// pkg_export.ExportImgCol(imgcol_count, undefined, range, cellsize, type, folder, crs);
// pkg_export.ExportImg(t_et_v2, 'PMLV2_et_annual_trend', range, cellsize, type, folder, crs); //, crsTransform
