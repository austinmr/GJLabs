var express = require('express');
var axios = require('axios'); 
var API_KEY = require('../key/config.js'); 
var Promise = require('bluebird'); 
var _ = Promise.promisifyAll(require('underscore'));
var beerStyles = require('../../../beerdata/beerStyles.js'); 
var User = require('../models/models.js').User;
var Beer = require('../models/models.js').Beer;
var BeerLog = require('../models/models.js').BeerLog;
var averageBeer = {ibu: 20, srm: 20}; 
var PBR = require('../../../beerdata/PBR.js')

//// DATA FOR ALGORITHM //// 
var algorithm = require('./algorithm.js');  
////////////////

var styleFamilies = require('../../../beerdata/styleFamilies.js');

module.exports = {

  get: function (req, res, next) {
    res.send(index); 
  },

  post: function (req, res, next) {
    var count = 0;
    var style = req.body.beers[0];
    // console.log(req.body.beers[0]); 
    var styles = beerStyles[style]; 
    // var styles = [30, 164]; //req.data.styles;
    var lookupStr = 'http://api.brewerydb.com/v2/beer/' + style + '/?key=' + API_KEY; 
    console.log(lookupStr); 
    axios.get(lookupStr)
    .then(function(beerData) {
      var results = [];
      var startIBU = beerData.data.data.ibu; //req.data.ibu;
      var startABV = beerData.data.data.abv; //req.data.abv;
      var test = makeReq(results, styles, startIBU, startABV, count, res, 0);
    }); 
  }, 

  algorithmPost: function (req, res, next) {
    console.log('req.body:', req.body);
    var algorithmResult = algorithm(beerList); 
    var results = [];

    var startIBU = algorithmResult.ibu; //req.data.ibu;
    var startABV = algorithmResult.abv;
    var styles = algorithmResult.styles; 
    var styleCount = algorithmResult.styleCount; 
    algorithmRequest(algorithmResult, results, styles, styleCount, startIBU, startABV, 0, res, 0); 
  },

  algorithmGet: function (req, res, next) {
    getBeerList(req.params.userId).then(function(beerList) {
      var algorithmResult = algorithm(beerList); 
      var results = [];
      var startIBU = algorithmResult.ibu; //req.data.ibu;
      var startABV = algorithmResult.abv;
      var styles = algorithmResult.styles; 
      var styleCount = algorithmResult.styleCount; 
      algorithmRequest(algorithmResult, results, styles, styleCount, startIBU, startABV, 0, res, 0); 
    })
  }
};


// Recursive request function that makes a request to the BreweryDB API using recursive axios 'GET'
// request to ensure that we are receiving a list of beer recommendations of the desired length. 
// NOTE: required because brewerydb only allows one request to be processed at a time. 
//
var makeReq = function(results, styles, startIBU, startABV, count, res, index, incSize) {
  count++;
  console.log('MAKING REQUEST #:',count); 
  var style = styles[index];
  var incSize = incSize || .05;
  console.log('INC SIZE:', incSize); 
  var reqString = requestStrBuilder(style, startIBU, startABV, count, incSize);

  axios.get(reqString)
  .then(function(getResponse) {
    if (getResponse.data.totalResults > 15 && count < 3) {
      results.push(makeReq(results, styles, startIBU, startABV, count, res, index, incSize/2));
    } else if (getResponse.data.totalResults === undefined && count < 3) {
      incSize = (incSize * Math.max(0.75, Math.random())); 
      results.push(makeReq(results, styles, startIBU, startABV, count, res, index, incSize * 2));
    } else if (index === styles.length - 1) {
      results.push(getResponse.data.data);
      results = resultsCleaner(results); 
      if (results.length === undefined) {
        var beer = PBR; 
      } else {
        var beer = Math.floor(Math.random() * results.length); 
        beer = results[beer]; 
        var styleFamily = findStyleFamily(beer.styleId, styleFamilies); 
        beer['styleFamily'] = styleFamily[1]; 
        beer['styleFamilyId'] = styleFamily[0];
        beer = addDataToResponseObjectOriginal(beer);        
      }
      res.json(beer); 
    } else {
      results.push(getResponse.data.data);
      results.push(makeReq(results, styles, startIBU, startABV, 0, res, index + 1));
    }
    return results;
  })
  .catch(function (error) {
    console.log(error);
  });
}

  //makes requests with information input by the algrithm.
var algorithmRequest = function(algorithmResult, results, styles, styleCount, startIBU, startABV, count, res, index, incSize) {
  var style = styles[index];
  var incSize = incSize || .05;
  console.log('INC SIZE:', incSize); 
  var reqString = requestStrBuilder(style, startIBU, startABV, count, incSize);
  count++;
  axios.get(reqString)
  .then(function(getResponse) {
    if (getResponse.data.totalResults > 35 && count < 3) {
      if (count === 2) { 
        incSize = incSize * 1.8; 
      } else {
        incSize = (incSize * Math.max(0.90, Math.random())); 
      }
      results.push(algorithmRequest(algorithmResult, results, styles, styleCount, startIBU, startABV, count, res, index, incSize/2));

    } else if (getResponse.data.totalResults === undefined && count < 3) {
      incSize = (incSize * Math.max(0.75, Math.random())); 
      results.push(algorithmRequest(algorithmResult, results, styles, styleCount, startIBU, startABV, count, res, index, incSize * 2));

    } else if (index === styles.length - 1) {
      var responseArray = getResponse.data.data;
      if (responseArray === undefined) {
        responseArray = [PBR]; 
      }
      if (responseArray.length > styleCount[style]) {
        var startIndex = responseArray.length - styleCount[style]; 
        startIndex = Math.floor(Math.random() * startIndex); 
        var endIndex = startIndex + styleCount[style]; 
        responseArray = responseArray.slice(startIndex, endIndex); 
        results.push(responseArray); 
      } else {
        results.push(getResponse.data.data);
      }
      results = resultsCleaner(results); 
      var beer = Math.floor(Math.random() * results.length); 
      console.log('CHOOSING 1 BEER FROM A LIST OF ' + results.length + ' beers!'); 
      resultsNames = results.map((result) => result.name); 
      beer = results[beer]; 

      var styleFamily = findStyleFamily(beer.styleId, styleFamilies); 
      beer['styleFamily'] = styleFamily[1]; 
      beer['styleFamilyId'] = styleFamily[0]; 
      var averageBeer = {ibu: 20, srm: 20}

      beer = addDataToResponseObject(beer, algorithmResult, averageBeer); 
      console.log(beer); 

      res.json(beer); 

    } else {
      var responseArray = getResponse.data.data;
      if (responseArray === undefined) {
        responseArray = [PBR]; 
      }
      if (responseArray.length > styleCount[style]) {
        var startIndex = responseArray.length - styleCount[style]; 
        startIndex = Math.floor(Math.random() * startIndex); 
        var endIndex = startIndex + styleCount[style]; 
        responseArray = responseArray.slice(startIndex, endIndex); 
        results.push(responseArray); 
      } else {
        results.push(getResponse.data.data);
      }
      results.push(algorithmRequest(algorithmResult, results, styles, styleCount, startIBU, startABV, 0, res, index + 1));
    }
    return results;
  })
  .catch(function (error) {
    console.log(error);
  });
}

// Utility helper function that takes style, IBU, ABV to generate a query string for the BreweryDB API
var requestStrBuilder = function(style, startIBU, startABV, count, incSize) {
  var finalStr = 'http://api.brewerydb.com/v2/beers/?availabilityId=1&withBreweries=Y'
  if(startIBU != undefined) {
    finalStr += '&ibu=' + (startIBU - startIBU*incSize) + ',' + (startIBU + startIBU*incSize);
  }
  finalStr += '&styleId=' + style;
  finalStr += '&key=' + API_KEY;
  return finalStr;
}

// Utility cleaner function for concatenating and removing undefined value from results array. 
var resultsCleaner = function (results) {
  return results.reduce(function(a,b) {
    if (b === undefined) {
      return a; 
    } else {
      return a.concat(b); 
    }
  },[]); 
}

var allStyles = []; 
for (var key in beerStyles) {
  allStyles.concat(beerStyles[key]); 
}

allStyles.sort(function(a,b) {
  return a - b; 
}); 

// Utility helper function for adding a given beer's styleFamily and styleFamilyId properties
// to the returned object. 
var findStyleFamily = function(styleId, styleFamilyObject) {
  var styleFamilyResult = []; 
  if (styleFamilyObject[styleId] !== undefined) {
    styleFamilyResult.push(styleId, styleFamilyObject[styleId]); 
    return styleFamilyResult; 
  }
  var styleKeys = Object.keys(styleFamilyObject); 
  styleKeys.forEach((style) => {
    var currentStyleFamily = styleFamilyObject[style]; 
    if (currentStyleFamily.indexOf(styleId) !== -1) {
      styleFamilyResult.push(style, currentStyleFamily); 
    }
  }); 
  return styleFamilyResult; 
}


var getBeerList = function(userId){
  return User.findById(userId).then(function(user) {
    return user.getBeers()
  });
}

var addDataToResponseObject = function (responseObject, algorithmResult, averageBeer) {
  // Add the styles description if the beer does not have description field 
  if (responseObject.description === undefined) {
    responseObject.description = responseObject.style.description; 
  }
  // Calculates an srm if the property is undefined 
  if (typeof responseObject.srm === 'object') {
    responseObject.srm = responseObject.srmId; 
    console.log('NEW RESPONSE OBJECT SRM: ', responseObject.srm); 

  } else if (responseObject.srm === undefined) {
    if (responseObject.style.srmMax === undefined || responseObject.style.srmMax === undefined) {
        responseObject.srm = 10; 
        console.log('NEW RESPONSE OBJECT SRM: ', responseObject.srm); 
    } else {
      responseObject.srm = (parseInt(responseObject.style.srmMax) - parseInt(responseObject.style.srmMin) / 2 ) || null; 
      console.log('NEW RESPONSE OBJECT SRM: ', responseObject.srm); 
    }
  } 
  // Calculates an ibu if the property is undefined 
  if (responseObject.ibu === undefined) {
    if (responseObject.style.ibuMin === undefined || responseObject.style.ibuMax === undefined) {
        responseObject.ibu = 20; 
      } else {
        responseObject.ibu = (parseInt(responseObject.style.ibuMax) - parseInt(responseObject.style.ibuMin) / 2 ) || null;
      }
  }   
  responseObject.color = resultStringGeneratorSRM(algorithmResult, averageBeer, 'srm'); 
  responseObject.bitter = resultStringGeneratorIBU(algorithmResult, averageBeer, 'ibu'); 
  var color = resultStringGeneratorSRM(algorithmResult, averageBeer, 'srm'); 
  var bitter = resultStringGeneratorIBU(algorithmResult, averageBeer, 'ibu'); 
  var categories = algorithmResult.topThreeCategories; 
  var favoriteStyle = algorithmResult.topStyle; 
  responseObject.flavorText = addFlavorText(responseObject, color, bitter, categories, favoriteStyle); 
  return responseObject; 
}

  
var addDataToResponseObjectOriginal = function (responseObject) {
  // Add the styles description if the beer does not have description field 
  if (responseObject.description === undefined) {
    responseObject.description = responseObject.style.description; 
  }
  // Calculates an srm if the property is undefined 
  if (typeof responseObject.srm === 'object') {
    responseObject.srm = responseObject.srmId; 
    console.log('NEW RESPONSE OBJECT SRM: ', responseObject.srm); 

  } else if (responseObject.srm === undefined) {
    if (responseObject.style.srmMax === undefined || responseObject.style.srmMax === undefined) {
        responseObject.srm = 10; 
        console.log('NEW RESPONSE OBJECT SRM: ', responseObject.srm); 
    } else {
      responseObject.srm = (parseInt(responseObject.style.srmMax) - parseInt(responseObject.style.srmMin) / 2 ) || null; 
      console.log('NEW RESPONSE OBJECT SRM: ', responseObject.srm); 
    }
  } 
  // Calculates an ibu if the property is undefined 
  if (responseObject.ibu === undefined) {
    if (responseObject.style.ibuMin === undefined || responseObject.style.ibuMax === undefined) {
        responseObject.ibu = 20; 
      } else {
        responseObject.ibu = (parseInt(responseObject.style.ibuMax) - parseInt(responseObject.style.ibuMin) / 2 ) || null;
      }
  }    
  // responseObject.color = resultStringGeneratorSRM(algorithmResult, averageBeer, 'srm'); 
  // responseObject.bitter = resultStringGeneratorIBU(algorithmResult, averageBeer, 'ibu'); 
  return responseObject; 
}

var resultStringGeneratorIBU = function(object, comparison, key) {
  var string = ''; 
  if (object.ibu > comparison.ibu) {
    // string = 'more bitter'
    string = 'stronger flavor profile, characterized by more bitterness and hop flavor'
  } else {
    string = 'more restrained flavor profile with less bite'
  }
  if (object[key] > (1.5 * comparison[key])) {
    string = '' + string; 
  } else if (object[key] >= (1.1 * comparison[key])) {
    string = 'slightly ' + string; 
  } else if (comparison[key] >= (1.1 * object[key])) {
    string = 'slightly ' + string; 
  } else {
    string = 'balanced flavor profile'
  }
  return string; 
}

  //function to turn srm data into strings.
var resultStringGeneratorSRM = function(object, comparison, key) {
  var string = ''; 
  if (object.srm > comparison.srm) {
    string = 'darker'
  } else {
    string = 'lighter'
  }
  if (object[key] > (1.5 * comparison[key])) {
    string = string; 
  } else if (object[key] >= (1.1 * comparison[key])) {
    string = 'slightly ' + string; 
  } else if (comparison[key] >= (1.1 * object[key])) {
    string = 'slightly ' + string; 
  } else {
    string = 'traditional'
  }
  return string; 
}
  
var addFlavorText = function(responseObject, color, bitter, categories, favoriteStyle) {
  if (categories === undefined) {
    var template = `Welcome to Bru! Based on your initial selection, we have selected the following beers for you. Continue to add beers that you like to your taste profile, so that we can help you find your perfect Bru!`; 
  } else {
    var category1 = categories[0] || 'PBR';
    var category2 = categories[1] || 'PBR';
    var category3 = categories[2] || 'PBR'; 
    var template = `After analyzing your Bru profile, it appears that you prefer a ${color} beer, with a ${bitter}. Our algorithm indicates that you may enjoy ${category1}, ${category2} and ${category3}. Based on your taste profile, we have selected the following beers for you. Continue to add beers that you like to your taste profile, so that we can help you find your perfect Bru!`; 
  }
  return template; 
}
