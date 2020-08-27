/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var img_new = ee.Image("users/kongdd/MCD12Q1_LC1_2017_001"),
    imgcol = ee.ImageCollection("MODIS/006/MCD12Q1");
/***** End of imports. If edited, may not auto-convert in the playground. *****/

var img_origin = imgcol.filterDate('2017-01-01', '2018-01-01').first().select(0);
var img_diff = img_new.subtract(img_origin);

Map.addLayer(img_origin, {min:0, max:17}, 'img_origin');
Map.addLayer(img_new, {min:0, max:17}, 'img_new');
Map.addLayer(img_diff, {min:-5, max:5}, 'diff');
