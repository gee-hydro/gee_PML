/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var poly = ee.FeatureCollection("projects/pml_evapotranspiration/landcover_impact/representative_poly"),
    imgcol = ee.ImageCollection("projects/pml_evapotranspiration/PML/V2/PMLV2_yearly_v015_staticLC2003");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var pkg_export = require('users/kongdd/public:pkg_export.js');

// print(poly);

pkg_export.clipImgCol = function(ImgCol, features, distance, reducer, file, options){
    var folder     = options.folder     || "";     // drive forder
    var fileFormat = options.fileFormat || "csv";  // 'csv' or 'geojson'
    var save =  (options.save === undefined) ? true : options.save;

    distance   = distance   || 0;
    reducer    = reducer    || "first";

    if (distance > 0) features = features.map(function(f) { return f.buffer(distance);});

    var image = ee.Image(ImgCol.first()).select(0);
    var prj   = image.projection(), 
        scale = prj.nominalScale();
    // modify scale at here
    scale = scale.multiply(2*2); 
    print(scale)
    var options_reduce = { collection: features, reducer: reducer, crs: prj, scale: scale, tileScale: 16 };

    var export_data = ImgCol.map(pkg_export._Buffer(options_reduce), true).flatten();
    pkg_export.Export_Table(export_data, save, file, folder, fileFormat);
};


var options = {
    reducers : ['mean'],  // 1th: non-buffer; 2th: buffer; Only one means no buffer
    buffer   : false,      // whether to use buffer
    list     : false, 
    folder   : '', // drive forder
    fileFormat: 'csv'      // 'csv' or 'geojson'
};
pkg_export.spClipImgCol(imgcol, poly, "imgcol_2km", options)
