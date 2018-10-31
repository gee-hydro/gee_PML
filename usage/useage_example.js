/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var region = /* color: #98ff00 */ee.Geometry({
      "type": "GeometryCollection",
      "geometries": [
        {
          "type": "Polygon",
          "coordinates": [
            [
              [
                115.17190933227539,
                33.319340333534996
              ],
              [
                115.16521453857422,
                33.26553223114776
              ],
              [
                115.2714729309082,
                33.266824014208815
              ],
              [
                115.2520751953125,
                33.32852026740331
              ]
            ]
          ],
          "evenOdd": true
        },
        {
          "type": "Polygon",
          "coordinates": [
            [
              [
                -71.71875,
                0.615222552406841
              ],
              [
                -72.3779296875,
                -1.4500404973607948
              ],
              [
                -68.642578125,
                -1.5818302639606454
              ],
              [
                -68.203125,
                0.9228116626857066
              ]
            ]
          ],
          "geodesic": true,
          "evenOdd": true
        }
      ],
      "coordinates": []
    }),
    au_poly = ee.FeatureCollection("users/kongdd/shp/au_poly"),
    PML_V2 = ee.ImageCollection("projects/pml_evapotranspiration/PML/OUTPUT/PML_V2_8day"),
    PML_V2_yearly_latest = ee.ImageCollection("projects/pml_evapotranspiration/PML/v012/PML_V2_yearly_v013");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
/**
 * PML_V2 usage illustration 
 * 
 * Dongdong Kong, 22 March, 2018
 */
var pkg_vis    = require('users/kongdd/public:pkg_vis.js');
var pkg_export = require('users/kongdd/public:pkg_export.js');

// cal ET
var PML_V2_yearly = PML_V2_yearly_latest.select([1, 2, 3])
    .map(function(img){
        var ET = img.expression('b("Ec") + b("Es")+ b("Ei")').rename('ET');
        return img.addBands(ET);
    });


/** 1. visualization */ 
var palette = ['#570088', '#920057', '#CE0027', '#FF0A00', '#FF4500', '#FF8000', '#FFB100', '#FFD200', '#FFF200', '#C7EE03', '#70D209', '#18B80E', '#067F54', '#033FA9', '#0000FF'];
// var vis_gpp = { min: 0.0, max: 60.0, palette: palette.reverse(), bands: 'GPP'};
// var vis_et  = { min: 0.0, max: 1600.0, palette: palette.reverse(), bands: 'Ec'};
var vis_et  = {min: 100, max: 1600 , palette:pkg_vis.colors.RdYlBu[11], bands: 'ET'};
var vis_gpp = {min: 100, max: 3700 , palette:pkg_vis.colors.RdYlGn[11], bands: 'GPP'};
    
var vis_wue = { min: 0.0, max: 4.0   , palette: palette, bands: 'WUE'};

var vis = true;
if (vis){
    // Map.addLayer(PML_V2_yearly, vis_et , 'ET');
    // Map.addLayer(PML_V2_yearly, vis_et, 'PMLV2 annual ET');
    // Map.addLayer(PML_V2_yearly, vis_gpp, 'GPP');
    // Map.addLayer(PML_V2_yearly, vis_et , 'ET');
    // Map.addLayer(PML_V2_yearly, vis_wue, 'WUE');
    
    // add a legend to Map
    pkg_vis.grad_legend(vis_et , '(a) annual average ET');
    // pkg_vis.grad_legend(vis_gpp, '(b) annual average GPP');
    
    // the left corner chart is imgcol annual in the region you defined
    var label = ui.Label('2003-01-01'); Map.add(label);
    pkg_vis.series(PML_V2_yearly, vis_et, 'Annual ET', region, label);
}

/** 2. export data where you interested */

Map.addLayer(au_poly, {}, 'au_poly');
// Map.centerObject(au_poly, 4);

var imgcol = PML_V2_yearly.map(function(img){
    return img.clip(au_poly);
});
print(imgcol);
Map.addLayer(imgcol, vis_et, 'clipped PML_V2');

/** save data */
// print(au_poly.geometry());
var range  = [-180, -60, 180, 90], //[lon_min, lat_min, lon_max, lat_max]
    scale  = 1 / 240, //1/240, unit, degree
    drive  = false,
    folder = 'projects/pml_evapotranspiration/PML/PML_V2_yearly', //
    crs = 'SR-ORG:6974'; //default crs was modis projection in pkg_export.ExportImgCol
pkg_export.ExportImgCol(imgcol.limit(3), undefined, range, scale, drive, folder, crs);
