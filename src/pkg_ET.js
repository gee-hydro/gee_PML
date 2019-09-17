// var pkg_ET = require('users/kongdd/gee_PML:src/pkg_ET.js');

var pkg_ET = {};

pkg_ET.add_ETsum = function(img){
    var ET = img.expression('b("Ec") + b("Ei") + b("Es")').rename("ET");
    return img.addBands(ET);
}


exports = pkg_ET;
