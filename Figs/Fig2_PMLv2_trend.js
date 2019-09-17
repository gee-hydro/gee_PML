/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var imgcol_v011 = ee.ImageCollection("projects/pml_evapotranspiration/PML/OUTPUT/PML_V2_yearly"),
    imgcol_v014 = ee.ImageCollection("projects/pml_evapotranspiration/PML/v012/PML_V2_yearly_v014");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var pkg_trend = require('users/kongdd/public:Math/pkg_trend.js');
var pkg_vis   = require('users/kongdd/public:pkg_vis.js');
var p         = require('users/kongdd/gee_PML:Figs/legend.js');
var pkg_ET    = require('users/kongdd/gee_PML:src/pkg_ET.js');

// multiple panel map
var maps = pkg_vis.layout(2);
var labels = ['(a) v0.1.1', //meteorological forcing 
    '(b) v0.1.4'];
var imgcols = [imgcol_v011, imgcol_v014];

var options = {
    fullscreenControl: false, 
    mapTypeControl   : false,
    zoomControl: false,
    layerList  : false
};
        
maps.forEach(function(value, i) {
    var imgcol = imgcols[i];
    imgcol = imgcol.map(pkg_ET.add_ETsum);
    var img = pkg_trend.imgcol_trend(imgcol, 'ET', true);

    // var img = imgcol.first().select('GPP');
    var lab_style = {fontWeight:'bold', fontSize: 36};
    
    var map = maps[i];
    map.setControlVisibility(options);
    map.addLayer(img.select('slope'), p.vis.slp_gpp, 'gpp');
    map.widgets().set(3, ui.Label(labels[i], lab_style));
});

maps[0].add(p.lg.slp_gpp);
