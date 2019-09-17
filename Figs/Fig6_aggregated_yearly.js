/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var pml_v1 = ee.ImageCollection("projects/pml_evapotranspiration/PML/OUTPUT/PML_V1_8day"),
    pml_v2 = ee.ImageCollection("projects/pml_evapotranspiration/PML/OUTPUT/PML_V2_8day_v014"),
    pml_2018 = ee.ImageCollection("projects/pml_evapotranspiration/PML/V2/8day"),
    ImgCol_land = ee.ImageCollection("MODIS/006/MCD12Q1");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var pkg_export = require('users/kongdd/public:pkg_export.js');
var p          = require('users/kongdd/gee_PML:Figs/legend.js');
var pkg_ET     = require('users/kongdd/gee_PML:src/pkg_ET.js');
var pkg_vis    = require('users/kongdd/public:pkg_vis.js');

var years  = ee.List.sequence(2003, 2018);
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

// pml_v2 = pml_v2.merge()
/** fix MCD12Q1_006 land cover code. */
ImgCol_land = ImgCol_land.select([0], ['land'])
    .map(function(land){
        //for MCD12Q1_006 water and unc type is inverse
        land = land.remap([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17], 
            [17, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 0]); 
        return(land);
    });

var aggregate = aggregate_yearly(pml_2018, ImgCol_land);
var years        = ee.List.sequence(2018, 2019);

var aggregate = aggregate_yearly(pml_v2, ImgCol_land);
var years        = ee.List.sequence(2003, 2017);

var imgcol_years = ee.ImageCollection(years.map(aggregate));

print(imgcol_years);
// Map.addLayer(imgcol_years, {}, 'imgcol_years');

// Visualization of GPP and ET -------------------------------------------------
var year = 2010;
var filter_date = ee.Filter.calendarRange(year, year, 'year');
var img_show = imgcol_years.filter(filter_date).map(pkg_ET.add_ETsum).first();

var bands2 = ["ET", "GPP"];
var labels = bands2;
var maps   = pkg_vis.layout(2);

var options = {
    fullscreenControl: false, 
    mapTypeControl   : false,
    zoomControl      : false,
    layerList        : true
};

bands2.forEach(function(band, i) {
    // var img = pkg_trend.imgcol_trend(imgcol, 'ET', true);
    // var img = imgcol.first().select('GPP');
    var lab_style = {fontWeight:'bold', fontSize: 36};
    
    var map = maps[i];
    map.setControlVisibility(options);
    
    var vis = i === 0 ? p.vis.et : p.vis.gpp;

    map.addLayer(img_show.select(band), vis, band);
    map.widgets().set(3, ui.Label(year + " "+ labels[i], lab_style));
});

maps[0].add(p.lg.et);
maps[1].add(p.lg.gpp);



/** EXPORT ------------------------------------------------------------------ */

var prj    = pkg_export.getProj(ImgCol_land);
var range  = [-180, -60, 180, 90],
    scale  = 1 / 240, //1/240,
    drive  = false,
    crs    = 'SR-ORG:6974';// default crs was modis projection in pkg_export.ExportImgCol
// pkg_export.ExportImgCol(imgcol_years, undefined, range, scale, drive, folder, crs, prj.crsTransform);




/** GLOBAL FUNCTIONS ------------------------------------------------------- */

function toInt(img) {
    return ee.Image(img).multiply(1e2).toUint16()
        .copyProperties(img, ['system:time_start', 'system:id']);
}

/** 
 * aggregate into yearly
 * 
 * ImgCol_land as global variable
 */
function aggregate_yearly(imgcol, ImgCol_land){

    return function (year) {
        year = ee.Number(year);
        var date  = ee.Date.fromYMD(year, 1, 1);
        var ydays = date.advance(1, 'year').difference(date, 'day');
        
        var annual = imgcol.filter(ee.Filter.calendarRange(year, year, 'year'))
            .select(bands)
            .mean().multiply(ydays); //.divide(100);
        
        // var ET  = annual.expression('b("Ec") + b("Es")+ b("Ei")').rename('ET'); // + b("Ei")
        var img = annual.toFloat() //returned img
            .set('system:time_start', date.millis())
            .set('system:index', date.format('YYYY-MM-dd'))
            .set('system:id', date.format('YYYY-MM-dd'));
        
        // if (V2){
        //     var WUE = annual.expression('b("GPP") / ET', {ET:ET}).rename('WUE');
        //     img = img.addBands([WUE]);//, land
        // }
        var land;
        if (! ImgCol_land) {
            // Land cover data range: 2000-2016, add IGBP data into output for
            // calculate annual change grouped by IGBP.
            year = ee.Algorithms.If(year.gt(2016), 2016, year);
            land = ee.Image(ImgCol_land.filter(ee.Filter.calendarRange(year, year, 'year')).first());

            img  = img.addBands([land]);//, land    
        }
        
        // ET  = ee.Image(toInt(ET));
        // GPP = ee.Image(toInt(GPP));
        // var WUE = annual.expression('b("GPP") / b("Ec")').rename('WUE');
        return img;    
    };
}


// var range  = [-180, -60, 180, 90];
// var bounds = ee.Geometry.Rectangle(range, 'EPSG:4326', false); //[xmin, ymin, xmax, ymax]

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
