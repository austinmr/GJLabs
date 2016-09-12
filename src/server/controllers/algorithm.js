var _ = require('underscore'); 

//// BEER DATA ///////// 
var graphs = require('../graph/node.js');  
var aleGraph = graphs.aleGraph; 
var lagerGraph = graphs.lagerGraph; 
var styleFamilies = require('../../../beerdata/styleFamilies.js'); 
var styleFamilyNames = require('../../../beerdata/styleFamilyNames.js'); 
var stylesData = require('../../../beerdata/styles.js'); 
var averageBeer = {ibu: 20, srm: 20}

//// DATABASE MODELS ///////// 
var User = require('../models/models.js').User;
var Beer = require('../models/models.js').Beer;
var BeerLog = require('../models/models.js').BeerLog;

var algorithm = function(beerList) {
	var beerListStylesId = beerList.map((beer) => beer.styleId); 
	var beerListStyleFamilyIds = beerList.map((beer) => beer.styleFamilyId);
	var algorithmResult = {}; 

	//// DETERMINE THE BEERS CHARACTERISTIC VALUES (ibu, abv, srm) ////
	beerList_avgABV = beerList.map((beer) => {
		return propertyFinder('abv', beer); 
	})
	var avgABV = avgCalculator(beerList_avgABV); 	

	beerList_avgIBU = beerList.map((beer) => {
		return propertyFinder('ibu', beer); 
	})
	var avgIBU = avgCalculator(beerList_avgIBU); 

	beerList_avgSRM = beerList.map((beer) => {
		return propertyFinder('srm', beer); 
	})
	var avgSRM = avgCalculator(beerList_avgSRM); 

	// These values are used in either case, so we make them available here 
	algorithmResult.abv = avgABV
	algorithmResult.ibu = avgIBU
	algorithmResult.srm = avgSRM

	///// DETERMINE THE ALGORITHM CASE(SINGLE/MULTIPLE CATEGORIES) //// 
	var singleCategoryBoolean = _.every(beerListStyleFamilyIds, (styleId) =>  styleId === beerListStyleFamilyIds[0]);
 	console.log(singleCategoryBoolean); 

	if (singleCategoryBoolean) {
		console.log('RUNNING THE ALGORITHM FOR SINGLE CATEGORY!'); 

		var categoryId = beerListStyleFamilyIds[0]; 
		var selectionsPerStyleId = singleStyleCalculator(categoryId, 20, beerListStylesId); 
		var styleKeys = Object.keys(selectionsPerStyleId); 

		algorithmResult.styles = styleKeys; 
		algorithmResult.styleCount = selectionsPerStyleId; 

		console.log(algorithmResult); 
		return algorithmResult; 

	} else {
		console.log('RUNNING THE ALGORITHM FOR MULTIPLE CATEGORIES!'); 

		var overLapScoresObject = getBeerOverlapScores(beerList);
		var primaryCategory = calculatePrimaryCategory(beerListStyleFamilyIds); 
		primaryCategoryData = stylesData[primaryCategory]; 
		primaryCategoryCharacteristics = calculateStyleCharacteristics(primaryCategoryData); 

		var comparisonData = calculateComparison(algorithmResult, primaryCategoryCharacteristics); 
		var currentNode = aleGraph.storage[primaryCategory] || lagerGraph.storage[primaryCategory]; 
		var similarNodes = calculateComparableNodes(comparisonData, currentNode); 

		var searchCategoryScores = calculateSearchCategoryScores(overLapScoresObject, similarNodes, primaryCategory); 
		var topThreeCategoriesKeys = [1,2,3]; 
		topThreeCategories = topThreeCategoriesKeys.map((key) => styleFamilyNames[searchCategoryScores[key][0]]); 
		algorithmResult.topThreeCategories = topThreeCategories; 

		searchCategoryScores = convertToCount(searchCategoryScores, 50); 
		var selectionsPerStyleId = algorithmSelectionsPerStyle(searchCategoryScores, beerListStylesId); 
		var styleKeys = Object.keys(selectionsPerStyleId); 
		var topStyle = {max: 0, name: undefined}; 

		styleKeys.forEach((style) => {
			if (selectionsPerStyleId[style] > topStyle.max) {
				topStyle.max = selectionsPerStyleId[style];
				topStyle.name = style; 
			}
		}); 
		
		algorithmResult.topStyle = topStyle.name;

		algorithmResult.styles = styleKeys; 
		algorithmResult.styleCount = selectionsPerStyleId; 

		console.log(algorithmResult); 
		return algorithmResult; 
	}
}; 

	//function to count when selected beers are near each other in the beer styles graph.
	//used to help determine if which styles should be recomended
var getBeerOverlapScores = function(beerList) {
	stylesScores = {};
	for (var i = 0; i < beerList.length; i++) {
		if (beerList[i].styleFamilyId === undefined) {
			beerList[i].styleFamilyId = findStyleFamilyId(beerList[i].styleId, styleFamilies); 
		} 
		var currentNode = getCurrentNode(beerList[i]);
		if (currentNode) {
			var adjFams = currentNode.allAdjacent();
			for (var j = 0; j < adjFams.length; j++) {
				if (adjFams[j] !== undefined && stylesScores[adjFams[j]] === undefined) {
					stylesScores[adjFams[j]] = 1;
				} else if (adjFams[j] !== undefined) {
					stylesScores[adjFams[j]]++;
				}
			}
			
		}
	}
	return stylesScores;
}

var getCurrentNode = function(beer) {
	for (var i = 0; i < aleGraph.nodes.length; i++) {
		if (beer.styleFamilyId === aleGraph.nodes[i].styleId) {
			return aleGraph.nodes[i]
		}
	}
	for (var i = 0; i < lagerGraph.nodes.length; i++) {
		if (beer.styleFamilyId === lagerGraph.nodes[i].styleId) {
			return lagerGraph.nodes[i]
		}
	}
}

// Naive approach for looking through array of styles in users beer list
// and checking if they all belong to the same styleFamily. 
var categoryConfirm = function(styleFamily, styleIdArray) {
	styleIdArray.forEach((styleId) => {
		if (styleFamily.indexOf(styleId) === -1) {
			return false
		}
	})
	return 1; 
};  

// Helper function to determine the number of categories based on the beers in beer list
// -> Uses indexOf to confirm that all beers are in the styleFamily. 
var categoryCountCalculation = function(styleFamily, styleIdArray) {
	styleIdArray.forEach((styleId) => {
		if (styleFamily.indexOf(styleId) === -1) {
			return 2; 
		}
	})
	return 1; 
};  

var selectionPerStyleCalculator = function(stylePercent, listLength, ratio, unselectedCount) {
	if (stylePercent > 0) {
		// console.log('percent: ', stylePercent); 
		// console.log('listlength: ', listLength); 
		return Math.floor(ratio * listLength * stylePercent); 
	} else {
		return Math.floor((1-ratio) * listLength / unselectedCount); 
	}
}

var avgCalculator = function(propertyArray) {
	// propertyArray = propertyArray.filter((a) => a !== null);
	propertyArray = propertyArray.map((ele) => parseInt(ele)); 
	propertyArray = propertyArray.map((ele) => String(ele));
	propertyArray = propertyArray.filter((a) => a !== 'NaN');
	var len = propertyArray.length; 
	propertyArray = propertyArray.map((ele) => parseInt(ele)); 
	return propertyArray.reduce((a,b) => a + b) / len; 
}; 

var calculateStyleCharacteristics = function (beerObject) {
	var characteristics = {}; 
	characteristics['ibu'] = stylePropertyFinder('ibu', beerObject); 
	characteristics['srm'] = stylePropertyFinder('srm', beerObject); 
 	return characteristics; 
}

var propertyFinder = function(property, beerDataObject) {
	var min = property + 'Min'; 
	var max = property + 'Max'; 
	console.log('LOOKING UP PROPERTY: ', property, beerDataObject[property]); 
	if (beerDataObject[property] !== undefined) {
		return parseFloat(beerDataObject[property]); 
	} else if (beerDataObject.style[min] !== undefined && beerDataObject.style[max] !== undefined) {
		return ( (parseFloat(beerDataObject.style[min]) + parseFloat(beerDataObject.style[max])) / 2 ); 
	} else {
		return null; 
	}
} 

var stylePropertyFinder = function(property, beerDataObject) {
	var min = property + 'Min'; 
	var max = property + 'Max'; 
    if (beerDataObject[min] !== undefined && beerDataObject[max] !== undefined) {
		return ( (parseFloat(beerDataObject[min]) + parseFloat(beerDataObject[max])) / 2 ); 
	} else {
		return null; 
	}
} 

var calculateComparison = function(algorithmObject, nodeObject) {
	var characteristicKeys = Object.keys(nodeObject); 
	var comparisonResult = {}; 
	comparisonResult['increase'] = []; 
	comparisonResult['decrease'] = []; 
	characteristicKeys.forEach((key) => {
		comparisonResult[key] = (algorithmObject[key] - nodeObject[key]).toFixed(2);
		var percent = (comparisonResult[key] / nodeObject[key]).toFixed(2); 
		comparisonResult[key + 'Percent'] = percent; 
		if (percent >= .15) {
			comparisonResult.increase.push(key); 
		} else if ( percent <= -.15) {
			comparisonResult.decrease.push(key);
		}
	}); 
	return comparisonResult; 
}

var calculateComparableNodes = function(comparisonObject, node) {
	var increase = comparisonObject.increase; 
	var decrease = comparisonObject.decrease;
	var comparableNodes = []; 

	increase.forEach(function(char) {

		if (char === 'ibu' && node.moreIBU !== undefined) {
			comparableNodes.push(node.moreIBU.styleId); 
		} else if (char === 'srm' && node.moreSRM !== undefined) {
			comparableNodes.push(node.moreSRM.styleId); 
		}
	}); 

	decrease.forEach(function(char) {
		if (char === 'ibu' && node.lessIBU !== undefined) {
			comparableNodes.push(node.lessIBU.styleId); 
		} else if (char === 'srm' && node.lessSRM !== undefined) {
			comparableNodes.push(node.lessSRM.styleId); 
		}
	}); 

	return comparableNodes; 
}

var calculatePrimaryCategory = function(beerListStylesId) {
	var categoryCount = {}; 
	categoryCount['max'] = 0; 
	categoryCount['maxStyle'] = undefined; 
	beerListStylesId.forEach((style) => {
		categoryCount[style] = categoryCount[style] + 1 || 1; 
		if (categoryCount[style] > categoryCount['max']) {
			categoryCount['max'] = categoryCount[style]; 
			categoryCount['maxStyle'] = style; 
		}; 
	}); 
	return categoryCount['maxStyle'] || beerListStylesId[0]; 
}

var calculateSearchCategoryScores = function (overLapScoresObject, similarNodes, primaryCategory) {
	if (!similarNodes) {
		return calculateTopValues(overLapScoresObject); 
	} else {
		similarNodes.forEach((node) => {
			overLapScoresObject[node] = overLapScoresObject[primaryCategory]; 
		}); 
		return calculateTopThree(overLapScoresObject); 
	}
}; 

var calculateTopThree = function (object) {
	var resultObject = {}; 
	var sortedArray = []; 
	var keys = Object.keys(object); 
	keys.forEach((key) => {
		sortedArray.push([key, object[key]]); 
	}); 
	sortedArray.sort(function(a,b) {
		return a[1] - b[1]; 
	}); 
	resultObject[1] = sortedArray[sortedArray.length - 1]; 
	resultObject[2] = sortedArray[sortedArray.length - 2]; 
	resultObject[3] = sortedArray[sortedArray.length - 3]; 
	resultObject['total'] = resultObject[1][1] + resultObject[2][1] + resultObject[3][1]; 
	return resultObject; 
}

var convertToCount = function (categoryObject, totalCountList) {
	var total = categoryObject.total; 
	delete categoryObject.total; 
	var keys = Object.keys(categoryObject); 
	var resultObject = {}
	keys.forEach((key) => {
		resultObject[categoryObject[key][0]] = Math.floor( (categoryObject[key][1] / total) * totalCountList);  
	}); 
	return resultObject; 
}

var algorithmSelectionsPerStyle = function (categoryCountObject, beerListStylesId) {
	var selectionsPerStyleId = {}; 
	var allStyleFamilies = []; 
	var unselected = 0; 
	var total = 0; 
	var preferredStyleIds = beerListStylesId.slice(); 
	var result = {}; 

	// This is to add the values that we are looking for to the preferredStyles so they will receive more distribution. 
	var keys = Object.keys(categoryCountObject); 

	keys.forEach((key) => {
		if (preferredStyleIds.indexOf(key) === -1) {
			preferredStyleIds.push(parseInt(key)); 
		} 
	}); 

	keys.forEach((key) => {
		selectionsPerStyleId[key] = singleStyleCalculator(key, categoryCountObject[key], preferredStyleIds); 
	}); 

	keys.forEach((key) => {
		_.extend(result, selectionsPerStyleId[key]);
	}); 

	return result; 
}

var singleStyleCalculator = function (styleId, totalCountForList, preferredStyleIds) {
	var selectedRatio = .75; 
	var unselectedRatio = .25; 
	var selectionsPerStyleId = {}; 
	var unselected = 0; 
	var total = 0; 
	var styleFamily = styleFamilies[styleId]; 

	var preferredInCategory = []; 

	preferredStyleIds.forEach(function(styleId) {
		if (styleFamily.indexOf(styleId) !== -1) {
			preferredInCategory.push(styleId); 
		}
	}); 

	preferredInCategory.forEach((style) => {
		selectionsPerStyleId[style] = selectionsPerStyleId[style] + 1 || 1;
		total++;  
	}); 

	styleFamily.forEach((style) => {
		if (selectionsPerStyleId[style] === undefined) {
			selectionsPerStyleId[style] = 0; 
			unselected++; 
		}; 
	}); 

	var styleKeys = Object.keys(selectionsPerStyleId); 
	styleKeys.forEach((key) => {
		var styleCount = selectionsPerStyleId[key]; 
		var stylePercent = styleCount / total; 
		var test = selectionPerStyleCalculator(stylePercent, totalCountForList, selectedRatio, unselected);
		selectionsPerStyleId[key] = test; 
	}); 

	return selectionsPerStyleId; 

}

var findStyleFamilyId = function(styleId, styleFamilies) {
  var styleFamilyId = ''; 
  var styleKeys = Object.keys(styleFamilies); 
  styleKeys.forEach((styleFamilyId) => {
  	if (styleFamilies[styleFamilyId].indexOf(styleFamilies) !== -1) {
  		styleFamilyId = styleFamilyId; 
  	}
  }); 
  return styleFamilyId; 
}


module.exports = algorithm; 