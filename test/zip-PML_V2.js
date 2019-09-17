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

var year = 2010;
var year_start = 2012;
var year_end   = year_start + 5;

pml_v2 = ee.ImageCollection(pml_v2.toList(1000, 0));

var filter_date = ee.Filter.calendarRange(year_start, year_end, 'year');
var imgcol = ee.ImageCollection(pml_v2.filter(filter_date));

imgcol = imgcol.map(zip_v2);
print(imgcol.limit(3));

// Map.addLayer(imgcol, {}, "imgcol");
/** EXPORT ------------------------------------------------------------------ */

var prj    = pkg_export.getProj(ImgCol_land);
var range  = [-180, -60, 180, 90],
    scale  = 1 / 240, //1/240,
    type   = "asset",
    folder = 'projects/pml_evapotranspiration/PML/V2/8day',//'projects/pml_evapotranspiration/PML_v2';
    crs    = 'SR-ORG:6974';// default crs was modis projection in pkg_export.ExportImgCol
pkg_export.ExportImgCol(imgcol, undefined, range, scale, type, folder, crs, prj.crsTransform);


/** Global functions -------------------------------------------------------- */

function zip_v2(img){
    var bands     = ['GPP', 'Ec', 'Ei', 'Es', 'ET_water'];
    var bands_all = ['GPP', 'Ec', 'Ei', 'Es', 'ET_water', 'qc'];
    
    img = ee.Image(img);
    var qc = img.select(["qc"]);

    var img_new = img.select(bands).multiply(1e2).toUint16();
    img_new = qc.addBands(img_new).select(bands_all);
    // print(img_new)
    return img_new;
}
