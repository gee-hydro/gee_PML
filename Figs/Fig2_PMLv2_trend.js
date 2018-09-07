/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var imgcol_v012 = ee.ImageCollection("projects/pml_evapotranspiration/PML/v012/PML_V2_yearly_bilinear"),
    imgcol_v011 = ee.ImageCollection("projects/pml_evapotranspiration/PML/OUTPUT/PML_V2_yearly");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var pkg_vis   = require('users/kongdd/public:pkg_vis.js');
var pkg_trend = require('users/kongdd/public:Math/pkg_trend.js');

var vis_slp = {min:-20, max:20, palette:["ff0d01","fafff5","2aff03"]};
var lg_slp  = pkg_vis.grad_legend(vis_slp, 'Trend (gC m-2 y-2)', false);

// multiple panel map
var maps = pkg_vis.layout(2);
var labels = ['(a) v0.1.1', //meteorological forcing 
    '(b) v0.1.2'];
var imgcols = [imgcol_v011, imgcol_v012];

var options = {
    fullscreenControl: false, 
    mapTypeControl   : false,
    zoomControl: false,
    layerList  : false
};
        
maps.forEach(function(value, i) {
    var imgcol = imgcols[i];
    imgcol = imgcol.map(function(img){
        var ET = img.expression('b("Ec") + b("Ei") + b("Es")').rename("ET");
        return img.addBands(ET);
    });
    var img = pkg_trend.imgcol_trend(imgcol, 'GPP', true);

    // var img = imgcol.first().select('GPP');
    var lab_style = {fontWeight:'bold', fontSize: 36};
    
    var map = maps[i];
    map.setControlVisibility(options);
    map.addLayer(img.select('slope'), vis_slp, 'gpp');
    map.widgets().set(3, ui.Label(labels[i], lab_style));
});

maps[0].add(lg_slp);





