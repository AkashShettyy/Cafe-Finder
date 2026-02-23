let currentLat;
let currentLon;
let radiusCircle;
let cafesData = [];
let cafeMarkers = [];

const map = L.map("map");

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

// Get Location
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
}

// Distance Function
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Fetch Cafes
function findCafes(userLat, userLon, radius = 5000) {
  document.getElementById("loading").style.display = "block";
  document.getElementById("noResults").style.display = "none";

  cafeMarkers.forEach((marker) => map.removeLayer(marker));
  cafeMarkers = [];

  if (radiusCircle) map.removeLayer(radiusCircle);

  radiusCircle = L.circle([userLat, userLon], {
    radius: radius,
    color: "blue",
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
    .then((res) => res.json())
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

      cafesWithDistance.sort((a, b) => a.distance - b.distance);
      cafesData = cafesWithDistance;

      renderCafeList(cafesData);

      document.getElementById("loading").style.display = "none";
    });
}

// Render Cafes
function renderCafeList(cafes) {
  const cafeList = document.getElementById("cafeList");
  cafeList.innerHTML = "";

  if (cafes.length === 0) {
    document.getElementById("noResults").style.display = "block";
    return;
  }

  cafes.forEach((cafe) => {
    const marker = L.marker([cafe.lat, cafe.lon])
      .addTo(map)
      .bindPopup(`☕ ${cafe.name}<br>${cafe.distance.toFixed(2)} km`);

    cafeMarkers.push(marker);

    const li = document.createElement("li");
    li.innerHTML = `
      <strong>${cafe.name}</strong><br>
      ${cafe.distance.toFixed(2)} km away
    `;

    li.addEventListener("click", function () {
      document
        .querySelectorAll("#cafeList li")
        .forEach((item) => item.classList.remove("activeCafe"));

      li.classList.add("activeCafe");

      map.setView([cafe.lat, cafe.lon], 17);
      marker.openPopup();
    });

    cafeList.appendChild(li);
  });
}

// Radius Change
document.getElementById("radius").addEventListener("change", function () {
  findCafes(currentLat, currentLon, parseInt(this.value));
});

// Search
document.getElementById("searchInput").addEventListener("input", function () {
  const text = this.value.toLowerCase();

  const filtered = cafesData.filter((cafe) =>
    cafe.name.toLowerCase().includes(text),
  );

  cafeMarkers.forEach((marker) => map.removeLayer(marker));
  cafeMarkers = [];

  renderCafeList(filtered);
});

// Dark Mode Toggle
document.getElementById("darkToggle").addEventListener("click", function () {
  document.documentElement.classList.toggle("dark");
});
