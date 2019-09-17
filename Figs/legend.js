// var p = require('users/kongdd/gee_PML:Figs/legend.js');

var pkg_vis = require('users/kongdd/public:pkg_vis.js');

/**
 * Visualization Parameters for yearly ET and GPP
 */

// visualization parameters
var vis_et      = {min: 100, max: 1600, palette:pkg_vis.colors.RdYlBu[11]};
var vis_gpp     = {min: 100, max: 3500, palette:pkg_vis.colors.RdYlGn[11]};

var palette     = ['#570088', '#920057', '#CE0027', '#FF0A00', '#FF4500', '#FF8000', '#FFB100', '#FFD200', '#FFF200', '#C7EE03', '#70D209', '#18B80E', '#067F54', '#033FA9', '#0000FF'];
var vis_wue     = { min: 0.0, max: 4.0, palette: palette};
// var vis_per = { min: 0.0, max: 20 , palette: palette, bands: 'per'};
var vis_perc    = { min: 0, max: 100 , palette: palette, bands: 'per'};

var vis_slp_et  = {min: -20, max:   20, palette:["ff0d01","fafff5","2aff03"]};
var vis_slp_gpp = {min: -20, max:   20, palette:["ff0d01","fafff5","2aff03"]};

// legends
var lg_gpp      = pkg_vis.grad_legend(vis_gpp, 'GPP', false); 
var lg_et       = pkg_vis.grad_legend(vis_et , 'ET' , false); 
var lg_wue      = pkg_vis.grad_legend(vis_wue, 'WUE', false);
var lg_perc     = pkg_vis.grad_legend(vis_perc, 'percentage', false);

var lg_slp_gpp  = pkg_vis.grad_legend(vis_slp_gpp, 'Trend (gC m-2 y-1)', false); //gC m-2 y-2, kPa y-1
var lg_slp_et   = pkg_vis.grad_legend(vis_slp_et , 'Trend (mm y-1)', false); //gC m-2 y-2, kPa y-1


// export
exports = {
    vis: {
        et     : vis_et, 
        gpp    : vis_gpp, 
        wue    : vis_wue,
        perc   : vis_perc,
        slp_et : vis_slp_et, 
        slp_gpp: vis_slp_gpp, 
    }, 
    lg: {
        et     : lg_et, 
        gpp    : lg_gpp, 
        wue    : lg_wue,
        perc   : lg_perc,
        slp_et : lg_slp_et, 
        slp_gpp: lg_slp_gpp
    }
};
