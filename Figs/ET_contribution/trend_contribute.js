/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var imgcol = ee.ImageCollection("projects/pml_evapotranspiration/PML/v012/PML_V2_yearly_v014"),
    imgcol_static = ee.ImageCollection("projects/pml_evapotranspiration/PML/v012/PML_V2_yearly_v014_staticLC2003");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var pkg_join  = require('users/kongdd/public:pkg_join.js');
var pkg_vis   = require('users/kongdd/public:pkg_vis.js');

/** two images absolute difference */
var Img_diff = function(left, right, expression, map){
    return ee.Image(left).subtract(right); //.abs();
};


var imgcol_diff = pkg_join.ImgColFun(imgcol, imgcol_static, Img_diff);
var img_diff = imgcol_diff.mean();

var ET = img_diff.expression('b("Ec") + b("Es") + b("Ei")').rename('ET');
img_diff = img_diff.addBands(ET);

print(img_diff);
// Map.addLayer(imgcol_static, {}, 'imgcol_static');
// Map.addLayer(imgcol       , {}, 'imgcol');
// Map.addLayer(imgcol_diff, {}, 'imgcol_diff');

var delta = 100;

var vis_et = {min:-delta , max:delta , palette:["ff0d01","fafff5","2aff03"]};
var lg_slp  = pkg_vis.grad_legend(vis_et, 'mean diff', false); //gC m-2 y-2


// Map.addLayer(img_diff.select('ET'), vis_et, 'ET img_diff');
// Map.addLayer(img_diff.select('GPP'), vis_et, 'GPP img_diff');
var bands = ['Ec', 'Ei', 'Es', 'ET'];

var maps = pkg_vis.layout(4);
maps.forEach(function(value, i) {
    // var img = imgcol.first().select('GPP');
    var lab_style = {fontWeight:'bold', fontSize: 36};
    
    var map = maps[i];
    // map.setControlVisibility(options);
    var band = bands[i];
    map.addLayer(img_diff.select(band), vis_et, band);
    map.widgets().set(3, ui.Label(band, lab_style));
});


// maps[1].addLayer(t_gpp, vis_gpp, labels[3]);
// maps[1].addLayer(imgcol_v2, {}, 'original data');

maps[2].add(lg_slp);
