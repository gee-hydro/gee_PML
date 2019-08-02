/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var imgcol_lai = ee.ImageCollection("MODIS/006/MCD15A3H"),
    imgcol_evi = ee.ImageCollection("MODIS/006/MOD13A1"),
    img_gde = ee.Image("projects/pml_evapotranspiration/Cooper/COO_GDEs"),
    poly = ee.FeatureCollection("projects/pml_evapotranspiration/Cooper/COO_gde_poly"),
    poly0 = ee.FeatureCollection("projects/pml_evapotranspiration/Cooper/COO_Lat_Lon"),
    imgcol_pmlv2 = ee.ImageCollection("projects/pml_evapotranspiration/PML/OUTPUT/PML_V2_8day_v014");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
/**
 * PML_V2 usage illustration 
 * 
 * Dongdong Kong, 22 June, 2018
 */
var pkg_vis    = require('users/kongdd/public:pkg_vis.js');
var pkg_export = require('users/kongdd/public:pkg_export.js');

imgcol_pmlv2 = imgcol_pmlv2.limit(100);
imgcol_pmlv2 = imgcol_pmlv2.map(function(img){
    var ET = img.expression('b("Ei") + b("Ec") + b("Es")').rename('ET');
    return img.addBands(ET);
});
// imgcol_pmlv2 = imgcol_pmlv2.select([0, 1, 2, 3])
//     .map(function(img){
//         return img.clip(poly0).divide(100)
//             .copyProperties(img, ['system:time_start']);
//     });

/** 1. visualization */ 
var palette = ['#570088', '#920057', '#CE0027', '#FF0A00', '#FF4500', '#FF8000', '#FFB100', '#FFD200', '#FFF200', '#C7EE03', '#70D209', '#18B80E', '#067F54', '#033FA9', '#0000FF'];
var vis_gpp = { min: 0.0, max: 60.0, palette: palette.reverse(), bands: 'GPP'};
var vis_et  = { min: 0.0, max: 1600.0, palette: palette.reverse(), bands: 'ET'};
var vis_et  = { min: 0.0, max: 5.0, palette: palette.reverse(), bands: 'ET'};
var vis_wue = { min: 0.0, max: 4.0   , palette: palette, bands: 'WUE'};

var vis = true;
if (vis){
    // Map.addLayer(PML_V2_yearly, vis_et , 'ET');
    // Map.addLayer(imgcol_pmlv2.select('ET'), vis_et, 'PMLV2 8days')
    
    // Map.addLayer(PML_V2_yearly, vis_gpp, 'GPP');
    // Map.addLayer(PML_V2_yearly, vis_et , 'ET');
    // Map.addLayer(PML_V2_yearly, vis_wue, 'WUE');
    
    // add a legend to Map
    pkg_vis.grad_legend(vis_et , '(a) ET (mm d-1)');
    // pkg_vis.grad_legend(vis_gpp, '(b) annual average GPP');
    
    // the left corner chart is imgcol annual in the region you defined
    // var label = ui.Label('2003-01-01'); Map.add(label);
    // pkg_vis.series(PML_V2_yearly, vis_et, 'Annual ET', region, label);
}

/** T percentage */
var imgcol_perc = imgcol_pmlv2.map(function(img){
    return img.expression('b("Ec") / (b("Ec") + b("Ei") + b("Es"))')
        .copyProperties(img, ['system:time_start']);
});

var label = ui.Label('text');
Map.add(label);

// var region = img_gde.geometry();
// Map.addLayer(region, {}, 'aggregate region');

series(imgcol_pmlv2.select('ET'), vis_et, 'imgcol_pmlv2 8-day', poly0, label, 5000);
// Map.centerObject(poly, 8);
Map.addLayer(poly, {}, 'BASIN');
// Map.addLayer(img_gde, {}, 'gde');

// Map.addLayer(imgcol_perc, {}, 'imgcol_perc');

// Map.addLayer(imgcol_lai.select('Lai'), {}, 'imgcol_lai');
// Map.addLayer(imgcol_evi.select('EVI'), {}, 'imgcol_evi');


function series(ImgCol, vis, name, region, label) {
    var img = ee.Image(ImgCol.first());
    Map.addLayer(img, vis, name);

    var chart = ui.Chart.image.series({
        imageCollection: ImgCol, //['ETsim', 'Es', 'Eca', 'Ecr', 'Es_eq']
        region         : region,
        reducer        : ee.Reducer.mean(),
        scale          : 500
    });

    // When the chart is clicked, update the map and label.
    chart.onClick(function(xValue, yValue, seriesName) {
        if (!xValue) return; // Selection was cleared.
        var datestr   = (new Date(xValue)).toUTCString();
        chart.setOptions({title: datestr});
        // Show the image for the clicked date.
        var equalDate = ee.Filter.equals('system:time_start', xValue);

        var img   = ee.Image(ImgCol.filter(equalDate).first());
        var Layer = ui.Map.Layer(img, vis, name);
        Map.layers().reset([Layer]);
        
        // Show a label with the date on the map.
        if (typeof label !== undefined){
            label.setValue(ee.Date(xValue).format('yyyy-MM-dd').getInfo()); //.toUTCString(), E, 
        }
    });

    // Add the chart to the map.
    chart.style().set({ position: 'bottom-right', width: '500px', height: '300px' });    
    Map.add(chart);
}
