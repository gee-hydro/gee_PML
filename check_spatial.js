/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var imgcol = ee.ImageCollection("projects/pml_evapotranspiration/PML/OUTPUT/PML_V2_8day_v014");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
/** 
 * Spatial distribution of PML_V2 GPP
 * Dongdong Kong
 */
var img = imgcol.first();

var palette = ["a50026", "d73027", "f46d43", "fdae61", "fee08b", "ffffbf", "d9ef8b", "a6d96a", "66bd63", "1a9850", "006837"];
var vis_gpp = {min: 0, max: 9, palette:palette, bands:['GPP']};

var range = [-82, -34, -35, 13];  // amazon
var bounds = ee.Geometry.Rectangle(range, 'EPSG:4326', false);

Map.setCenter(-58.5, -10.5, 4);
Map.addLayer(img, vis_gpp, 'PML_V2 GPP');
Map.addLayer(bounds);

// Export video
// var images = ee.ImageCollection(ET.visualize(vis_et));
var images = ee.ImageCollection(img.visualize(vis_gpp));

Export.video.toDrive({
  collection: images, 
  description: 'PML_V2_thumbnail', 
  folder: '', 
  framesPerSecond: 1, 
  dimensions: '256x265', 
  region: bounds,
  // crs: 'SR-ORG:6974'
});
