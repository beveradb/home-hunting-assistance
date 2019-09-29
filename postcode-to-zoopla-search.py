#!/usr/bin/env python3

from mapbox import Geocoder
import json
import urllib.request
import os
import polyline
import webbrowser
import jinja2
from shapely.geometry import Polygon, LineString, mapping
from shapely.ops import unary_union
import matplotlib.pyplot as plt
from descartes import PolygonPatch
import alphashape

# This script requires you have environment variables set with your personal API keys:
# MAPBOX_ACCESS_TOKEN from https://docs.mapbox.com/help/how-mapbox-works/access-tokens/
# TRAVELTIME_APP_ID from https://docs.traveltimeplatform.com/overview/introduction
# TRAVELTIME_API_KEY from https://docs.traveltimeplatform.com/overview/introduction

# Parameters for where to search and what to search for!
targetLocationAddress = "WC1A 2TH, London, UK"
maxWalkingTimeMins = "30"
maxPublicTransportTimeMins = "30"
rental = True
sharedAccommodation = False
minPrice = ""
maxPrice = "1300"
minBeds = "1"
maxBeds = ""
customKeywords = ""

# Additional Zoopla URL query parameters logic
rentOrSaleString = "to-rent" if rental else "for-sale"
sharedAccommodationString = "true" if sharedAccommodation else "false"
locationString = "UK"

geocoder = Geocoder()
targetLocationGeocode = geocoder.forward(targetLocationAddress)
targetLocationGeocodeFeature = targetLocationGeocode.geojson()['features'][0]
targetLocationLngLat = targetLocationGeocodeFeature['geometry']['coordinates']
targetLocationLngLatString = ','.join(map(str, targetLocationLngLat))
# print("targetLocationLngLatString: " + targetLocationLngLatString)

# walkingIsochroneURL = "https://api.mapbox.com/isochrone/v1/mapbox/walking/" + targetLocationLngLatString + "?contours_minutes=" + maxWalkingTimeMins + "&access_token=" + os.environ['MAPBOX_ACCESS_TOKEN']
# # print("walkingIsochroneURL: " + walkingIsochroneURL)
# walkingIsochroneResponseObject = json.load(urllib.request.urlopen(walkingIsochroneURL))

# walkingIsochroneGeometry = walkingIsochroneResponseObject['features'][0]['geometry']['coordinates']
# walkingIsochronePolyline = polyline.encode(walkingIsochroneGeometry, 5, True)
# walkingIsochronePolylineUrlencoded = urllib.parse.quote(walkingIsochronePolyline)
# # print("walkingIsochronePolylineUrlencoded: " + walkingIsochronePolylineUrlencoded)

publicTransportIsochroneRequestHeaders = {
    'Content-Type': 'application/json',
    "X-Application-Id": os.environ['TRAVELTIME_APP_ID'],
    "X-Api-Key": os.environ['TRAVELTIME_API_KEY'],
}
publicTransportIsochroneRequestBodyJSON = json.dumps({
    "departure_searches": [
        {
            "id": "first request",
            "coords": {"lng": targetLocationLngLat[0], "lat": targetLocationLngLat[1]},
            "transportation": {"type": "public_transport"},
            "departure_time": "2019-09-30T08:00:00+0000",
            "travel_time": int(maxPublicTransportTimeMins) * int(60)
        }
    ],
    "arrival_searches": []
})
publicTransportIsochroneRequest = urllib.request.Request(
    'http://api.traveltimeapp.com/v4/time-map', 
    publicTransportIsochroneRequestBodyJSON.encode("utf-8"),
    publicTransportIsochroneRequestHeaders
)
publicTransportIsochroneResponse = json.load(urllib.request.urlopen(publicTransportIsochroneRequest))

publicTransportIsochronePointsGeoJSONArray = []
publicTransportIsochroneShapesGeoJSONArray = []

publicTransportIsochronePolygonsArray = []
publicTransportIsochroneCentroidsArray = []

# Initialize plot
fig, ax = plt.subplots()

for shapeIndex, singleShape in enumerate(publicTransportIsochroneResponse['results'][0]['shapes']):
    shapeGeomTuplesArray = []
    shapeGeomMapboxArray = []
    
    for singleShellCoord in singleShape['shell']:
        coordTuple = (singleShellCoord['lat'], singleShellCoord['lng'])
        shapeGeomTuplesArray.append(coordTuple)
        
        coordMapboxArray = [singleShellCoord['lng'], singleShellCoord['lat']]
        shapeGeomMapboxArray.append(coordMapboxArray)
        publicTransportIsochronePointsGeoJSONArray.append(coordMapboxArray)

    shapePolygon = Polygon(shapeGeomMapboxArray)

    publicTransportIsochroneShapesGeoJSONArray.append(shapeGeomTuplesArray)
    publicTransportIsochronePolygonsArray.append(shapePolygon)
    publicTransportIsochroneCentroidsArray.append(shapePolygon.centroid)
    
    ax.plot(*Polygon(shapeGeomMapboxArray).exterior.xy)

# Buffer the linestring between all centrepoints and plot that
bufferedConnectingLine = LineString(publicTransportIsochroneCentroidsArray).buffer(0.00001)

# Determine the optimized alpha parameter
# alpha = alphashape.optimizealpha(publicTransportIsochronePointsGeoJSONArray)
# print("Optimal alpha calulated: " + str(alpha))
# alpha = 250

# # Generate the alpha shape
# publicTransportIsochroneAlpha = alphashape.alphashape(publicTransportIsochronePointsGeoJSONArray, alpha)

# # Combine the alpha shape with the combined polygon of all the original desired areas in case the alpha is too extreme
publicTransportIsochroneMultipolygon = unary_union(publicTransportIsochronePolygonsArray)
# publicTransportIsochroneCombinedMultipolygon = unary_union([publicTransportIsochroneAlpha, publicTransportIsochroneMultipolygon])

# ax.add_patch(PolygonPatch(publicTransportIsochroneCombinedMultipolygon, alpha=.2))

publicTransportIsochroneCombinedPolygon = unary_union([publicTransportIsochroneMultipolygon, bufferedConnectingLine])
ax.add_patch(PolygonPatch(publicTransportIsochroneCombinedPolygon))

publicTransportIsochroneCombinedCoords = []

for coord in list(zip(*publicTransportIsochroneCombinedPolygon.exterior.coords.xy)):
    publicTransportIsochroneCombinedCoords.append([coord[0], coord[1]])

# for polygon in publicTransportIsochroneCombinedMultipolygon:
#     for coord in list(zip(*polygon.exterior.coords.xy)):
#         publicTransportIsochroneCombinedCoords.append([coord[0], coord[1]])

tempMapPlotFilename = "mapbox-polygon-concave.html"
jinja2.Template(open("mapbox-polygon-template.html").read()).stream(
     MAPBOX_ACCESS_TOKEN=os.environ['MAPBOX_ACCESS_TOKEN'],
     MAP_CENTER_POINT_COORD=targetLocationLngLat,
     MAP_LAYER_GEOJSON=[publicTransportIsochroneCombinedCoords]
 ).dump(tempMapPlotFilename)

webbrowser.open_new("file://" + os.getcwd() + "/" + tempMapPlotFilename)

plt.show()

# print(publicTransportIsochroneShapesArray)

# zooplaURL = "https://www.zoopla.co.uk/" + rentOrSaleString + "/map/property/"
# zooplaURL += locationString + "/?q=" + locationString
# zooplaURL += "&category=residential"
# zooplaURL += "&country_code="
# zooplaURL += "&include_shared_accommodation=" + sharedAccommodationString
# zooplaURL += "&keywords=" + customKeywords
# zooplaURL += "&radius=0"
# zooplaURL += "&added="
# zooplaURL += "&available_from="
# zooplaURL += "&price_frequency=per_month"
# zooplaURL += "&price_min=" + minPrice
# zooplaURL += "&price_max=" + maxPrice
# zooplaURL += "&beds_min=" + minBeds
# zooplaURL += "&beds_max=" + maxBeds
# zooplaURL += "&include_retirement_homes=true"
# zooplaURL += "&include_shared_ownership=" + sharedAccommodationString
# zooplaURL += "&new_homes=include"
# zooplaURL += "&polyenc=" + urllib.parse.quote(publicTransportIsochronePolyline)
# zooplaURL += "&search_source=refine"
# webbrowser.open_new(zooplaURL)
