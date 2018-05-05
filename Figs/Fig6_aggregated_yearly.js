/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var ImgCol_land = ee.ImageCollection("projects/pml_evapotranspiration/PML_INPUTS/MODIS/MCD12Q1_006"),
    pml_v1 = ee.ImageCollection("projects/pml_evapotranspiration/PML/OUTPUT/PML_V1_8day"),
    pml_v2 = ee.ImageCollection("projects/pml_evapotranspiration/PML/OUTPUT/PML_V2_8day");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var years  = ee.List.sequence(2004, 2017);
var V2     = true;
var imgcol, bands, folder;

if (V2){
    imgcol = pml_v2;
    bands  = ['GPP', 'Ec', 'Ei', 'Es', 'ET_water'];
    folder = 'projects/pml_evapotranspiration/PML/OUTPUT/PML_V2_yearly'; //
} else{
    imgcol = pml_v1;
    bands = ['Ec', 'Ei', 'Es', 'ET_water'];
    folder = 'projects/pml_evapotranspiration/PML/OUTPUT/PML_V1_yearly'; //
}
imgcol = ee.ImageCollection(imgcol.toList(1000, 0));

/** fix MCD12Q1_006 land cover code. */
ImgCol_land = ImgCol_land.map(function(land){
    //for MCD12Q1_006 water and unc type is inverse
    land = land.remap([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17], 
        [17, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 0]); 
    return(land);
}).select([0], ['land']);

function toInt(img) {
    return ee.Image(img).multiply(1e2).toUint16()
        .copyProperties(img, ['system:time_start', 'system:id']);
}

var range  = [-180, -60, 180, 90];
var bounds = ee.Geometry.Rectangle(range, 'EPSG:4326', false); //[xmin, ymin, xmax, ymax]

var imgcol_years = years.map(function(year){
    year = ee.Number(year);
    var date = ee.Date.fromYMD(year, 1, 1);
    
    var annual = imgcol.filter(ee.Filter.calendarRange(year, year, 'year'))
        .select(bands)
        .mean().multiply(3.6525);
    
    // Land cover data range: 2000-2016, add IGBP data into output for
    // calculate annual change grouped by IGBP.
    year = ee.Algorithms.If(year.gt(2016), 2016, year);
    var land = ee.Image(ImgCol_land.filter(ee.Filter.calendarRange(year, year, 'year')).first());
        
    // var ET  = annual.expression('b("Ec") + b("Es")+ b("Ei")').rename('ET'); // + b("Ei")
    var img = annual.toFloat() //returned img
        .set('system:time_start', date.millis())
        .set('system:index', date.format('YYYY-MM-dd'))
        .set('system:id', date.format('YYYY-MM-dd'));
    
    // if (V2){
    //     var WUE = annual.expression('b("GPP") / ET', {ET:ET}).rename('WUE');
    //     img = img.addBands([WUE]);//, land
    // }
    img = img.addBands([land]);//, land
    // ET  = ee.Image(toInt(ET));
    // GPP = ee.Image(toInt(GPP));
    // var WUE = annual.expression('b("GPP") / b("Ec")').rename('WUE');
    return img;
});

imgcol_years = ee.ImageCollection(imgcol_years);
print(imgcol_years);
Map.addLayer(imgcol_years, {}, 'imgcol_years');
// var pkg_trend = require('users/kongdd/pkgs:Math/LinearRegression.js');

// var imgcol = imgcol_years.map(pkg_trend.addSeasonProb);
// print(imgcol_years);

// var robust = true;
// var trend_ET  = pkg_trend.linearTrend(imgcol.select('ET'), robust);
// var trend_GPP = pkg_trend.linearTrend(imgcol.select('GPP'), robust);
// var trend_WUE = pkg_trend.linearTrend(imgcol.select('WUE'), robust);

// print(trend_ET);
// Map.addLayer(imgcol.select([0, 1]), {}, 'origin');
// Map.addLayer(trend_ET, {}, 'ET');
// Map.addLayer(trend_GPP, {}, 'GPP');
// Map.addLayer(trend_WUE, {}, 'WUE');

// pkg_trend.linearTrend(ImgCol, robust)

// var IGBPcode = ee.List.sequence(1, 12);

//     var stats = IGBPcode.map(function(code){
//         var mask  = land.eq(ee.Image.constant(code));
//         var imgI = img.select([0, 1]).updateMask(mask);
        
//         var dict = imgI.reduceRegion({
//             reducer: ee.Reducer.mean().combine(ee.Reducer.count()), 
//             geometry: bounds,
//             scale:1e3*4,
//             maxPixels: 1e13
//         });
//         return dict;
//     });
//     // ee.Dictionary.fromLists(IGBPcode, stats)
//     return ee.Feature(null, stats)

/** save data */
var pkg_export = require('users/kongdd/public:pkg_export.js');
var range  = [-180, -60, 180, 90],
    scale  = 1 / 240, //1/240,
    drive  = false,
    crs    = 'SR-ORG:6974';// default crs was modis projection in pkg_export.ExportImgCol

pkg_export.ExportImgCol(imgcol_years, undefined, range, scale, drive, folder, crs);