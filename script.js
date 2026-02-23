let currentLat;
let currentLon;
let radiusCircle;

const map = L.map("map");

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(function (position) {
    const lat = position.coords.latitude;
    const lon = position.coords.longitude;

    map.setView([lat, lon], 15);

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

    L.marker([lat, lon], { icon: userIcon })
      .addTo(map)
      .bindPopup("📍 You are here")
      .openPopup();

    currentLat = lat;
    currentLon = lon;

    findCafes(lat, lon);
  });
} else {
  alert("Geolocation not supported");
}
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km

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

function findCafes(userLat, userLon, radius = 5000) {
  // Remove old circle if exists
  if (radiusCircle) {
    map.removeLayer(radiusCircle);
  }

  // Draw new circle
  radiusCircle = L.circle([userLat, userLon], {
    radius: radius, // in meters
    color: "blue",
    fillColor: "#add8e6",
    fillOpacity: 0.2,
  }).addTo(map);

  document.getElementById("loading").style.display = "block";
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
      const cafeList = document.getElementById("cafeList");
      cafeList.innerHTML = "";

      // Step 1: Build array
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
        document.getElementById("loading").style.display = "none";
      });

      // Step 2: Sort by nearest
      cafesWithDistance.sort((a, b) => a.distance - b.distance);

      // Step 3: Display sorted cafes
      cafesWithDistance.forEach((cafe) => {
        const marker = L.marker([cafe.lat, cafe.lon])
          .addTo(map)
          .bindPopup(`☕ ${cafe.name}<br>${cafe.distance.toFixed(2)} km away`);

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
    });
}
document.getElementById("radius").addEventListener("change", function () {
  const selectedRadius = parseInt(this.value);

  map.eachLayer((layer) => {
    if (
      layer instanceof L.Marker &&
      !layer._popup?.getContent().includes("You are here")
    ) {
      map.removeLayer(layer);
    }
  });

  findCafes(currentLat, currentLon, selectedRadius);
});
