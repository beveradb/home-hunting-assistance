window.mainMap = {
    'map': null,
    'currentMarkers': [],
    'currentLayers': []
};

function map_loaded(map) {
    window.mainMap.map = map;
    $('#map-filter-menu').hide();

    $('#generateSearchAreaForm input').each(function (i, elem) {
        $(elem).val(localStorage.getItem($(elem).attr('id')));
    });

    $('#generateSearchAreaForm input').keypress(function (e) {
        if (e.which === 13) {
            $('#generateSearchAreaForm').submit();
            return false;
        }
    });

    $("#generateButton").click(function (e) {
        $('#generateSearchAreaForm').submit();
        return false;
    });

    $("#zooplaButton").click(function (e) {
        show_zoopla_search_modal();
        return false;
    });

    $("#generateSearchAreaForm").submit(function (e) {
        e.stopPropagation();
        e.preventDefault();

        let formInputs = $('#generateSearchAreaForm input');
        let formValid = !formInputs.map(function (key, elem) {
            return elem.checkValidity();
        }).get().some(function (value) {
            return value === false;
        });
        if (
            !($("#maxWalkingTimeInput").val()) &&
            !($("#maxCyclingTimeInput").val()) &&
            !($("#maxBusTimeInput").val()) &&
            !($("#maxCoachTimeInput").val()) &&
            !($("#maxTrainTimeInput").val()) &&
            !($("#maxDrivingTimeInput").val())
        ) {
            $('#errorModalTitle').text("Error");
            $('#errorModalBody').html("At least one of the travel options must be specified to generate an area!");
            $('#errorModal').modal();
            formValid = false;
        }

        if (formValid === false) {
            formInputs.each(function (key, elem) {
                return elem.reportValidity();
            });
            return false;
        }

        $("#generateButton").hide();
        $("#zooplaButton").hide();
        $('#generateButtonLoading').show();

        formInputs.each(function (i, elem) {
            localStorage.setItem($(elem).attr('id'), $(elem).val());
        });

        generate_and_plot_areas(
            $("#targetAddressInput").val(),
            $("#maxWalkingTimeInput").val(),
            $("#maxCyclingTimeInput").val(),
            $("#maxBusTimeInput").val(),
            $("#maxCoachTimeInput").val(),
            $("#maxTrainTimeInput").val(),
            $("#maxDrivingTimeInput").val(),
            $("#minIMDInput").val(),
            $("#maxRadiusInput").val(),
            $("#simplifyFactorInput").val(),
            function () {
                $('#generateButtonLoading').hide();
                $("#generateButton").show();
                $("#zooplaButton").show();

                $('#map').get(0).scrollIntoView();
            },
            function (jqXHR, textStatus) {
                $('#errorModalTitle').text("Server Error");
                let errorFrame = $("<iframe class='errorFrame'></iframe>");
                errorFrame.attr('srcdoc', jqXHR.responseText);
                $('#errorModalBody').empty().append(errorFrame);
                $('#errorModal').modal();

                $("#generateButton").show();
                $('#generateButtonLoading').hide();
            }
        );

        return false;
    });
}

function show_zoopla_search_modal() {
    $('#zooplaSearchModal').modal();

    $('#zooplaSearchButton').click(function (e) {
        let rentBuyString = $('#rentOrBuyInput').val() === "Rent" ? "to-rent" : "for-sale";
        let sharedAccommodationString = $('#sharedAccomodationInput').val() === "No" ? "false" : "true";
        let retirementHomesString = $('#retirementHomesInput').val() === "No" ? "false" : "true";
        let sharedOwnershipString = $('#sharedOwnershipInput').val() === "No" ? "false" : "true";

        let url = "https://www.zoopla.co.uk/" + rentBuyString + "/map/property/uk/?q=UK";
        url += "&category=residential";
        url += "&country_code=";
        url += "&include_shared_accommodation=" + sharedAccommodationString;
        url += "&keywords=" + encodeURIComponent($('#customKeywordsInput').val().toLowerCase());
        url += "&radius=0";
        url += "&added=";
        url += "&available_from=";
        url += "&price_frequency=per_month";
        url += "&price_min=" + $('#minPriceInput').val().toLowerCase();
        url += "&price_max=" + $('#maxPriceInput').val().toLowerCase();
        url += "&beds_min=" + $('#minBedsInput').val().toLowerCase();
        url += "&beds_max=" + $('#maxBedsInput').val().toLowerCase();
        url += "&include_retirement_home=" + retirementHomesString;
        url += "&include_shared_ownership=" + sharedOwnershipString;
        url += "&new_homes=include";
        url += "&polyenc=" + encodeURIComponent(
            polyline.fromGeoJSON(
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": window.currentPolygonsData['combinedIntersection']['polygon']['coordinates'][0]
                    },
                    "properties": {}
                }, 5
            )
        );
        url += "&search_source=refine";

        window.open(url, '_blank');
    });
}

function generate_and_plot_areas(
    targetAddress,
    maxWalkingTime,
    maxCyclingTime,
    maxBusTime,
    maxCoachTime,
    maxTrainTime,
    maxDrivingTime,
    minIMDInput,
    maxRadiusInput,
    simplifyFactorInput,
    successCallback,
    errorCallback
) {
    clear_map(window.mainMap.map);

    if (!maxWalkingTime) maxWalkingTime = 0;
    if (!maxCyclingTime) maxCyclingTime = 0;
    if (!maxBusTime) maxBusTime = 0;
    if (!maxCoachTime) maxCoachTime = 0;
    if (!maxTrainTime) maxTrainTime = 0;
    if (!maxDrivingTime) maxDrivingTime = 0;
    if (!minIMDInput) minIMDInput = 0;
    if (!maxRadiusInput) maxRadiusInput = 0;
    if (!simplifyFactorInput) simplifyFactorInput = 0;

    let targetAreaURL = "/target_area";
    let singleTargetData = {
        target: targetAddress,
        walking: maxWalkingTime,
        cycling: maxCyclingTime,
        bus: maxBusTime,
        coach: maxCoachTime,
        train: maxTrainTime,
        driving: maxDrivingTime,
        deprivation: minIMDInput,
        radius: parseFloat(maxRadiusInput).toFixed(8),
        simplify: parseFloat(simplifyFactorInput).toFixed(8)
    };
    let allTargetsData = [singleTargetData];

    $.ajax({
        url: targetAreaURL,
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(allTargetsData),
        success: function (data) {
            window.currentPolygonsData = data;
            plot_results(data);

            if (successCallback) {
                successCallback();
            }
        },
        error: function (jqXHR, textStatus) {
            if (errorCallback) {
                errorCallback(jqXHR, textStatus);
            }
        }
    });
}

function plot_results(api_call_data) {
    // Accessible, distinct colours from https://sashat.me/2017/01/11/list-of-20-simple-distinct-colors/
    let layer_colours = ["#e6194B", "#4363d8", "#f58231", "#f032e6", "#469990", "#9A6324", "#800000", "#000075"];
    let result_green = "#3cb44b";

    let current_colour = 1;
    for (let key in api_call_data) {
        // skip if the property is from prototype
        if (!api_call_data.hasOwnProperty(key)) continue;

        let single_result = api_call_data[key];

        if (single_result.hasOwnProperty('polygon') && key !== "result_intersection") {
            plot_polygon(key, single_result['label'], single_result['polygon'],
                layer_colours[current_colour], 0.3, false
            );

            current_colour++;
            if (current_colour >= layer_colours.length) {
                current_colour = 0;
            }
        }
    }

    plot_polygon('result_intersection', api_call_data['result_intersection']['label'],
        api_call_data['result_intersection']['polygon'], result_green, 0.7, true
    );

    plot_marker(
        api_call_data['target']['label'] + api_call_data['target']['coords'],
        api_call_data['target']['coords']
    );

    $('#map-filter-menu').show();

    if (api_call_data['combined_transport_box']) {
        map.fitBounds(api_call_data['combined_transport_box']['bounds']);
    }

    let centerOnce = function (e) {
        map.panTo(api_call_data['target']['coords']);
        map.off('moveend', centerOnce);
    };
    map.on('moveend', centerOnce);

}

function plot_marker(label, coords) {
    let popup = new mapboxgl.Popup({offset: 25})
        .setText(label);

    let targetMarker = new mapboxgl.Marker()
        .setLngLat(coords)
        .setPopup(popup)
        .addTo(map);

    window.mainMap.currentMarkers.push(targetMarker);
}

function plot_polygon(id, label, polygon, color, opacity = 0.3, visible = true) {
    window.mainMap.currentLayers.push(id);

    let menuItem = $(
        "<a href='#' style='background-color: " + color + "'>" + label + "</a>"
    );

    if (visible) menuItem.addClass('active');

    menuItem.click(function (e) {
        let visibility = window.mainMap.map.getLayoutProperty(id, 'visibility');

        if (visibility === 'visible') {
            window.mainMap.map.setLayoutProperty(id, 'visibility', 'none');
            $(this).removeClass('active');
        } else {
            $(this).addClass('active');
            window.mainMap.map.setLayoutProperty(id, 'visibility', 'visible');
        }
        return false;
    });

    $("#map-filter-menu").append(menuItem);

    window.mainMap.map.addLayer({
        'id': id,
        'type': 'fill',
        'source': {
            'type': 'geojson',
            'data': {
                'type': 'Feature',
                'geometry': polygon
            }
        },
        'layout': {
            'visibility': (visible ? 'visible' : 'none')
        },
        'paint': {
            'fill-color': color,
            'fill-opacity': opacity
        },
        'metadata': {
            'home-area-helper': true
        }
    });
}

function clear_map() {
    $('#map-filter-menu').empty().hide();

    if (window.mainMap.currentMarkers !== null) {
        for (let i = window.mainMap.currentMarkers.length - 1; i >= 0; i--) {
            window.mainMap.currentMarkers[i].remove();
        }
    }

    if (window.mainMap.currentLayers !== null && window.mainMap.map) {
        let hhaLayers = window.mainMap.map.getStyle().layers.filter(function (el) {
            return (el['metadata'] && el['metadata']['home-area-helper']);
        });

        for (let i = hhaLayers.length - 1; i >= 0; i--) {
            window.mainMap.map.removeLayer(hhaLayers[i]['id']);
            window.mainMap.map.removeSource(hhaLayers[i]['id']);
        }
    }
}