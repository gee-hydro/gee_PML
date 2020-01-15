/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var imgcol_gldas = ee.ImageCollection("NASA/GLDAS/V021/NOAH/G025/T3H"),
    imgcol_era = ee.ImageCollection("ECMWF/ERA5/DAILY"),
    imgcol_emiss = ee.ImageCollection("MODIS/006/MOD11A2"),
    imgcol_albedo = ee.ImageCollection("MODIS/006/MCD43A3"),
    imgcol_lai_4d = ee.ImageCollection("MODIS/006/MCD15A3H"),
    imgcol_lai = ee.ImageCollection("MODIS/006/MOD15A2H");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var pkg_trend = require('users/kongdd/public:Math/pkg_trend.js');
var imgcol_last = pkg_trend.imgcol_last;

var date_begin = '2019-01-01';
var date_end   = '2019-12-31';

check_newImgs(imgcol_gldas);
check_newImgs(imgcol_era);
check_newImgs(imgcol_emiss);
check_newImgs(imgcol_lai_4d);
check_newImgs(imgcol_lai);

function check_newImgs(imgcol){
  imgcol = imgcol.filterDate(date_begin, date_end);
  var n = imgcol.size();
  print(imgcol_last(imgcol), n);
}
