var pkg_join = require('users/kongdd/public:pkg_join.js');
var pkg_vis = require('users/kongdd/public:pkg_vis.js');
// var pkg_main = require('users/kongdd/public:pkg_main.js');
// var pkg_trend = require('users/kongdd/public:Math/pkg_trend.js');
// var pkg_export = require('users/kongdd/public:pkg_export2.js');

var pkg_PML = {};
pkg_PML.add_ETsum = function(img){
    var ET = img.expression('b("Ec") + b("Ei") + b("Es")').rename("ET");
    return img.addBands(ET);
};

var vis_et  = { min: 100, max: 1600, palette: pkg_vis.colors.RdYlBu[11] },
    vis_gpp = { min: 100, max: 3500, palette: pkg_vis.colors.RdYlGn[11] };
var vis_slp = { min: -20, max: 20, palette: ["ff0d01", "fafff5", "2aff03"] }; // green to red

var is_compare = true;
if (is_compare) {

    var imgcol_new = ee.ImageCollection("projects/pml_evapotranspiration/landcover_impact/PMLV2_yearly_v015_dynamic");
    var imgcol_org = ee.ImageCollection("projects/pml_evapotranspiration/landcover_impact/PMLV2_yearly_v015_static");

    // compare with previous version
    // var imgcol_new = ee.ImageCollection('projects/pml_evapotranspiration/landcover_impact/PMLV2_yearly_v015_dynamic');
    // var imgcol_org = ee.ImageCollection('projects/pml_evapotranspiration/PML/V2/yearly');
    var imgcol_diff = pkg_join.ImgColFun(imgcol_new, imgcol_org, pkg_join.Img_absdiff);
    
    // print(pkg_export.getProj(imgcol_new), pkg_export.getProj(imgcol_org))
    var delta = 100;
    var vis = { min: -delta, max: delta, bands:'Ec', palette: ["ff0d01", "fafff5", "2aff03"] };
    
    // pkg_vis.grad_legend(vis, 'new-org');
    
    vis_et.bands = "ET";
    // print(vis_et)
    function show_ET_map(imgcol, label) {
        var img = pkg_PML.add_ETsum(imgcol.first());
        Map.addLayer(img, vis_et, label);    
    }

    show_ET_map(imgcol_org, 'org');
    show_ET_map(imgcol_new, 'new');
    Map.addLayer(imgcol_diff, vis, 'new-org');
    pkg_vis.grad_legend(vis_et, 'ET'); 
}
