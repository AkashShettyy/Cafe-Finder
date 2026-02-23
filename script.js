let currentLat;
let currentLon;
let radiusCircle;
let cafesData = [];
let cafeMarkers = [];

const map = L.map("map");

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

// =======================
// Get User Location
// =======================

if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(function (position) {
    currentLat = position.coords.latitude;
    currentLon = position.coords.longitude;

    map.setView([currentLat, currentLon], 15);

    const userIcon = new L.Icon({
      iconUrl:
        "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
      shadowUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });

    L.marker([currentLat, currentLon], { icon: userIcon })
      .addTo(map)
      .bindPopup("📍 You are here")
      .openPopup();

    findCafes(currentLat, currentLon);
  });
} else {
  alert("Geolocation not supported");
}

// =======================
// Distance Calculation
// =======================

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;

  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// =======================
// Fetch Cafes
// =======================

function findCafes(userLat, userLon, radius = 5000) {
  // Show loading
  document.getElementById("loading").style.display = "block";

  // Remove old markers
  cafeMarkers.forEach((marker) => map.removeLayer(marker));
  cafeMarkers = [];

  // Remove old circle
  if (radiusCircle) {
    map.removeLayer(radiusCircle);
  }

  // Draw new circle
  radiusCircle = L.circle([userLat, userLon], {
    radius: radius,
    color: "blue",
    fillColor: "#add8e6",
    fillOpacity: 0.2,
  }).addTo(map);

  const query = `
    [out:json];
    node["amenity"="cafe"](around:${radius}, ${userLat}, ${userLon});
    out;
  `;

  fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: query,
  })
    .then((response) => response.json())
    .then((data) => {
      const cafesWithDistance = [];

      data.elements.forEach((cafe) => {
        if (cafe.lat && cafe.lon) {
          const name = cafe.tags.name || "Unnamed Cafe";

          const distance = calculateDistance(
            userLat,
            userLon,
            cafe.lat,
            cafe.lon,
          );

          cafesWithDistance.push({
            name,
            lat: cafe.lat,
            lon: cafe.lon,
            distance,
          });
        }
      });

      // Sort nearest first
      cafesWithDistance.sort((a, b) => a.distance - b.distance);

      cafesData = cafesWithDistance;

      renderCafeList(cafesData);

      // Hide loading
      document.getElementById("loading").style.display = "none";
    });
}

// =======================
// Render Cafe List
// =======================

function renderCafeList(cafes) {
  const cafeList = document.getElementById("cafeList");
  cafeList.innerHTML = "";

  cafes.forEach((cafe) => {
    const marker = L.marker([cafe.lat, cafe.lon])
      .addTo(map)
      .bindPopup(`☕ ${cafe.name}<br>${cafe.distance.toFixed(2)} km away`);

    cafeMarkers.push(marker);

    const li = document.createElement("li");
    li.innerHTML = `
      <strong>${cafe.name}</strong><br>
      ${cafe.distance.toFixed(2)} km away
    `;

    li.addEventListener("click", function () {
      map.setView([cafe.lat, cafe.lon], 17);
      marker.openPopup();
    });

    cafeList.appendChild(li);
  });
}

// =======================
// Radius Change Listener
// =======================

document.getElementById("radius").addEventListener("change", function () {
  const selectedRadius = parseInt(this.value);
  findCafes(currentLat, currentLon, selectedRadius);
});

// =======================
// Search Filter
// =======================

document.getElementById("searchInput").addEventListener("input", function () {
  const searchText = this.value.toLowerCase();

  const filtered = cafesData.filter((cafe) =>
    cafe.name.toLowerCase().includes(searchText),
  );

  // Clear old markers
  cafeMarkers.forEach((marker) => map.removeLayer(marker));
  cafeMarkers = [];

  renderCafeList(filtered);
});
