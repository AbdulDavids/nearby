// Retrieve user's location
function getUserLocation() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(function(position) {
        var userLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
  
        var userLocationElement = document.getElementById('user-location');
        userLocationElement.textContent = 'Your Location: ' + userLocation.lat.toFixed(6) + ', ' + userLocation.lng.toFixed(6);
  
        // Retrieve nearby mosques
        getNearbyMosques(userLocation);
      }, function() {
        // Handle location error
        handleLocationError(true);
      });
    } else {
      // Browser doesn't support Geolocation
      handleLocationError(false);
    }
  }
  
  // Retrieve nearby mosques using Overpass API
  function getNearbyMosques(location) {
    var overpassURL = 'https://overpass-api.de/api/interpreter';
    var radius = 10000; // 10 kilometers
  
    var query = `[out:json];
                  (
                    node["amenity"="place_of_worship"]["religion"="muslim"](around:${radius},${location.lat},${location.lng});
                    way["amenity"="place_of_worship"]["religion"="muslim"](around:${radius},${location.lat},${location.lng});
                    relation["amenity"="place_of_worship"]["religion"="muslim"](around:${radius},${location.lat},${location.lng});
                  );
                  out center;`;
  
    // Show loading bar
    var loadingBar = document.getElementById('loading-bar');
    loadingBar.style.display = 'block';
  
    fetch(overpassURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'data=' + encodeURIComponent(query)
    })
      .then(function(response) {
        return response.json();
      })
      .then(function(data) {
        var results = data.elements;
  
        // Sort the list of nearby mosques by distance
        results.sort(function(a, b) {
          var distanceA = getDistance(location, a.lat, a.lon);
          var distanceB = getDistance(location, b.lat, b.lon);
          return distanceA - distanceB;
        });
  
        // Hide loading bar
        loadingBar.style.display = 'none';
  
        // Handle the sorted list of nearby mosques
        var mosqueList = document.getElementById('mosque-list');
        mosqueList.innerHTML = ''; // Clear previous list
  
        var numMosques = Math.min(results.length, 10); // Display only the first 10 mosques
  
        for (var i = 0; i < numMosques; i++) {
          var mosque = results[i];
          var mosqueContainer = document.createElement('div');
          mosqueContainer.className = 'mosque-container';
  
          var mosqueName = document.createElement('h3');
          mosqueName.textContent = mosque.tags.name || 'Unnamed Mosque';
  
          var mosqueLocation = document.createElement('p');
          mosqueLocation.textContent = mosque.lat.toFixed(6) + ', ' + mosque.lon.toFixed(6);
  
          var distance = getDistance(location, mosque.lat, mosque.lon) / 1000; // Convert meters to kilometers
          var mosqueDistance = document.createElement('p');
          mosqueDistance.textContent = 'Distance: ' + distance.toFixed(2) + ' km';
  
          mosqueContainer.appendChild(mosqueName);
          mosqueContainer.appendChild(mosqueLocation);
          mosqueContainer.appendChild(mosqueDistance);
  
          mosqueList.appendChild(mosqueContainer);
        }
      })
      .catch(function(error) {
        console.log('Error:', error);
        // Hide loading bar
        loadingBar.style.display = 'none';
      });
  }
  
  // Calculate distance between two locations
  function getDistance(location, lat, lng) {
    var lat1 = location.lat;
    var lng1 = location.lng;
    var lat2 = lat;
    var lng2 = lng;
  
    var R = 6371; // Radius of the Earth in kilometers
    var dLat = deg2rad(lat2 - lat1);
    var dLng = deg2rad(lng2 - lng1);
  
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var distance = R * c * 1000; // Convert to meters
  
    return distance;
  }
  
  // Convert degrees to radians
  function deg2rad(deg) {
    return deg * (Math.PI / 180);
  }
  
  // Handle location error
  function handleLocationError(browserHasGeolocation) {
    var userLocationElement = document.getElementById('user-location');
    userLocationElement.textContent = 'Error: Unable to retrieve your location.';
    userLocationElement.style.color = 'red';
  }
  
  // Load the map and retrieve user's location
  function initMap() {
    getUserLocation();
  }
  
  // Call the initMap() function to start the process
  initMap();
  
