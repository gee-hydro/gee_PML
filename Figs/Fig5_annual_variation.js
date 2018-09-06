/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var MOD16A2_105 = ee.ImageCollection("MODIS/NTSG/MOD16A2/105"),
    MOD16A2_yr = ee.ImageCollection("projects/pml_evapotranspiration/MODIS/MOD16A2_yearly"),
    MOD17A2H_006 = ee.ImageCollection("MODIS/006/MOD17A2H"),
    pml_v1_yearly_v011 = ee.ImageCollection("projects/pml_evapotranspiration/PML/OUTPUT/PML_V1_yearly"),
    pml_v2_yearly_v011 = ee.ImageCollection("projects/pml_evapotranspiration/PML/OUTPUT/PML_V2_yearly"),
    MOD16A2_006 = ee.ImageCollection("MODIS/006/MOD16A2"),
    ImgCol_land = ee.ImageCollection("MODIS/006/MCD12Q1"),
    pml_v2_yearly_v012 = ee.ImageCollection("projects/pml_evapotranspiration/PML/v012/PML_V2_yearly_bilinear");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var imgcol_year, bands, folder, prefix, years,  
    V2 = false;
    
if (V2){
    imgcol_year = pml_v2_yearly_v012;
    bands  = ['GPP', 'ET']; //['GPP', 'Ec', 'Ei', 'Es', 'ET_water'];
    folder = 'projects/pml_evapotranspiration/PML/OUTPUT/PML_V2_yearly'; //
    prefix = 'PMLV2_IGBP_mean_';
    years  = [2011, 2016, 2017]; 
} else{
    imgcol_year = pml_v1_yearly_v011;
    bands  = ['ET'];//['Ec', 'Ei', 'Es', 'ET_water'];
    folder = 'projects/pml_evapotranspiration/PML/OUTPUT/PML_V1_yearly'; //
    prefix = 'PMLV1_IGBP_mean_';
    years  = [2003, 2004, 2006, 2008, 2009, 2016];
}

// years = years.reverse();
print(years);

/** GLOBAL PARAMETERS */
var range  = [-180, -60, 180, 90],
    bounds = ee.Geometry.Rectangle(range, 'EPSG:4326', false), //[xmin, ymin, xmax, ymax]
    scale  = 1e3,
    year_begin = 2003,
    year_end   = 2017;
    
// range  = [0, -60, 180, 90];
// prefix = 'PMLV2_IGBP_mean_2_';

imgcol_year = ee.ImageCollection(imgcol_year.toList(20, 0))
    .map(function(img){
        var ET = img.expression('b("Ec") + b("Ei") + b("Es")').rename('ET'); // + b("ET_water")
        return img.addBands(ET);
    });
// print(imgcol_year);
    
/** aggregated by IGBP */
var IGBPcode     = ee.List.sequence(0, 17);
var IGBPname_all = ["UNC", "ENF", "EBF", "DNF", "DBF", "MF", 
               "CSH", "OSH", "WSA", "SAV", "GRA", "WET", 
               "CRO", "URB", "CNV", "SNOW", "BSV", "WATER"];
// var IGBPname = ee.List(IGBPname_all).slice(1, IGBPcode.length().add(1)); //ignore `UNC`

/** fix MCD12Q1_006 land cover code. */
ImgCol_land = ImgCol_land.select(0).map(function(land){
    //for MCD12Q1_006 water and unc type is inverse
    land = land.remap([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17], 
        [17, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 0]); 
    return(land);
}).select([0], ['land']);

///////////////////////////////////////////////////////////////

IGBPmean(imgcol_year, bands, scale, prefix, year_begin, year_end);
// IGBPmean(MOD16A2_yr, bands, scale, 'MOD16A2_IGBP_mean_', year_begin, year_end);

MOD17A2H_006 = ee.ImageCollection(MOD17A2H_006.toList(1000, 0));
MOD17A2H_006 = MOD17A2H_006.select(['Gpp']);

MOD16A2_yr = ee.ImageCollection(MOD16A2_yr.toList(1000, 0));
MOD16A2_yr = MOD16A2_yr.select(['ET', 'PET']).map(function(img){
    var date = ee.Date(img.get('system:time_start'));
    date = ee.Date(ee.Algorithms.If(date.get('year').gt(2016), '2016-01-01', date));
    date = ee.Date(ee.Algorithms.If(date.get('year').lt(2001), ee.Date('2001-01-01'), date));
    var land = ee.Image(ImgCol_land.filterDate(date).first());
    return img.addBands(land);
});
// var imgcol = d8ToYearly_mod(MOD16A2);
// print(MOD16A2_yr);

// Map.addLayer(imgcol_year);
// var img = ee.Image(imgcol.first());
// print(img.geometry());
// Map.addLayer(img)
// print(MOD16A2);
// var imgcol_year_mod = d8ToYearly(MOD16A2);
// print(imgcol_year_mod);

function IGBPmean(imgcol, bands, scale, prefix, year_begin, year_end){
    /** define reducer */
    // define reduction function (client-side), see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/Reduce
    var combine = function(reducer, prev) { return reducer.combine(prev, null, true); };
    var reducers = [ ee.Reducer.mean(), ee.Reducer.count(), ee.Reducer.stdDev()];
    // var reducer = ee.Reducer.sum();
    // print(reducers.slice(1), 'reducers.slice(1)');
    var reducer = reducers.slice(1).reduce(combine, reducers[0]);
    // var reducer = ee.Reducer.mean().combine(ee.Reducer.count(), null, true);
    ////////////////////////////////////////////////////////////////////////////
    // print(imgcol, 'imgcol_check');
    
    // for (var i in years){
    //     var year = years[i];
    for (var year = year_begin; year <= year_end; year++){
        // var date        = ee.Date.fromYMD(year, 1, 1);
        var filter_year = ee.Filter.calendarRange(year, year, 'year');
        var img  = imgcol.filter(filter_year).first();
        
        var mask = img.select('ET').expression('b() >= 0 && b() < 5e3');
        // img = img.updateMask(mask);
        
        var land = ImgCol_land.filter(filter_year).first();
        var task = prefix.concat(year);
        // print(task, img);
        
        // var bands = ["ET", "GPP", "WUE"];
        // var bands = ['ET'];
        // 1. f is global mean
        // print(bounds, scale, bands)
        var f =  img.select(bands).reduceRegion({
            reducer: reducer,
            geometry: bounds,
            scale:scale, maxPixels: 1e13, tileScale: 16 });
        
        f = ee.Feature(null, f).set("IGBP", -1); //-1 means global mean
        print(f);
        // 2. fs is grouped by IGBP
        var fs = IGBPcode.map(function(code){
            code = ee.Number(code);
            // var expr ='b() == '.concat(code.toString()); 
            var mask = land.eq(ee.Image.constant(code)); //expression(expr); //
            var imgI = img.select(bands).updateMask(mask);
            
            var value =  imgI.reduceRegion({
                reducer  : reducer,
                geometry : bounds,
                scale:scale, maxPixels: 1e13, tileScale: 16 });
            value = ee.Feature(null, value)
                .set('IGBP', code);
                // .set('system:id', code.format('%02d'));
            return value;
        });
        // print(fs, 'fs');
        // var x  = ee.FeatureCollection(fs.add(f));
        var x  = ee.FeatureCollection(f); //fs
        // print(x);
        Export.table.toDrive({
            collection: x, 
            description: task,
            folder: "IGBP", 
            fileFormat: 'GeoJSON'
        });
    }
}
function d8ToYearly_mod(imgcol_d8){
    var years = ee.List.sequence(2000, 2014);
    
    var imgcol_year = years.map(function(year){
        year = ee.Number(year);
        var date = ee.Date.fromYMD(year, 1, 1);
        var annual = imgcol_d8.filter(ee.Filter.calendarRange(year, year, 'year'))
                .sum().multiply(0.1); //if null value occur, sum will be less.
        return annual
            .set('system:time_start', date.millis())
            .set('system:index', date.format('YYYY-MM-dd'))
            .set('system:id', date.format('YYYY-MM-dd'));
    });
    return ee.ImageCollection(imgcol_year);
}

function d8ToYearly(imcol_d8){
    var years = ee.List.sequence(2003, 2017);
    var imgcol_year = years.map(function(year){
        year = ee.Number(year);
        var date = ee.Date.fromYMD(year, 1, 1);
        
        var annual = imcol_d8.filter(ee.Filter.calendarRange(year, year, 'year'))
            .mean().multiply(3.6525);
        
        // Land cover data range: 2000-2016, add IGBP data into output for
        // calculate annual change grouped by IGBP.
        year = ee.Algorithms.If(year.gt(2016), 2016, year);
        var land = ee.Image(lands.filter(ee.Filter.calendarRange(year, year, 'year')).first())
            .rename(['land']);
            
        var ET  = annual.expression('b("Ec") + b("Es")+ b("Ei")').rename('ET'); // + b("Ei")
        // var GPP = annual.select('GPP');
        
        // ET  = ee.Image(toInt(ET));
        // GPP = ee.Image(toInt(GPP));
        // var WUE = annual.expression('b("GPP") / b("Ec")').rename('WUE');
        // var WUE = annual.expression('b("GPP") / ET', {ET:ET}).rename('WUE');
        
        return ee.Image(ET)
            // .addBands([GPP, WUE, land])//, land
            .set('system:time_start', date.millis())
            .set('system:index', date.format('YYYY-MM-dd'))
            .set('system:id', date.format('YYYY-MM-dd'));
        // return ET
        //     // .addBands([GPP, WUE, land])
        //     .addBands([GPP, land])
    });
    return ee.ImageCollection(imgcol_year);
}

var pkg_export = require('users/kongdd/public:pkg_export.js');
var range  = [-180, -60, 180, 90],
    scale  = 1 / 120, //1/240,
    drive  = false,
    folder = 'projects/pml_evapotranspiration/MODIS/MOD16A2_yearly'; //

// pkg_export.ExportImgCol(imgcol, undefined, range, scale, drive, folder);