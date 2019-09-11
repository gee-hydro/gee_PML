/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var imgcol2 = ee.ImageCollection("users/cuijian426/modis");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
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


var imgcol = ee.ImageCollection("MODIS/006/MOD13A1");
var img = imgcol.first().select('NDVI');

var prj_org = pkg_export.getProj(imgcol); 

var options = {
    crsTransform: prj_org.crsTransform, 
    folder: "users/cuijian426/modis", 
    tile_nx: 2, 
    tile_ny: 5
};
print(options, 'options');

var range     = [-180, -60, 180, 90];
// exportTiles(img, 'modisproj2', range, options);

var img2 = imgcol2.mosaic();
var img_mean = img2.add(img).divide(2);
var img_diff = img2.subtract(img);

var pkg_vis      = require('users/kongdd/public:pkg_vis.js');
var vis = {min: -1e3, max: 1e4, palette:pkg_vis.colors.Spectral[11]};
var vis_diff = {min: -1e3, max: 1e3, palette:pkg_vis.colors.RdBu[11]};
var lg1 = pkg_vis.grad_legend(vis, 'NDVI*1e4', false);
var lg2 = pkg_vis.grad_legend(vis_diff, 'difference*1e4', false);

// Map.addLayer(img, vis, 'original');
// Map.addLayer(img2, vis, 'combined ');
// Map.addLayer(img_mean, vis, 'mean');
// Map.addLayer(img_diff, vis_diff, 'diff');

/** visualization */
{
    var lab_style = { fontWeight: 'bold', fontSize: 80 };
    var images = [
        img, img2];
    var labels = ['(a) original', '(b) combined - original'];
    // var viss = [vis, vis_eos];
    //Others, 'Shrub' //'Crop', 'URB', 'GRA', 'Forest', 
    var nmap = labels.length;
    var maps = pkg_vis.layout(nmap, null, 2, false);
    var options = {
        fullscreenControl: false,
        mapTypeControl   : false,
        zoomControl      : false,
        layerList        : true
    };
    maps.forEach(function(value, i) {
        // var img = imgcol.first().select('GPP');
        var map = maps[i];
        var title = labels[i];
        // var vis =  (i % 2 === 0) ? viss[0]: viss[1];
        // var letter = String.fromCharCode(97+i);
        // var title = '('+letter+') ' + band;
        var img = images[i];
        // img = clip_poly(img);
        map.addLayer(img, vis, title);
        // map.addLayer(poly_arc);
        if (i === 1) {
            map.addLayer(img_mean, vis, 'mean');
            map.addLayer(img_diff, vis_diff, 'diff');
        }
        map.setControlVisibility(options);
        // map.setOptions('SATELLITE'); // "ROADMAP", "SATELLITE", "HYBRID" or "TERRAIN" 
        map.widgets().set(3, ui.Label(title, lab_style));
    });
    pkg_vis.add_lgds([lg1], maps[0]);
    pkg_vis.add_lgds([lg2], maps[1]);
}
