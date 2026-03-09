let currentLat;
let currentLon;
let radiusCircle;
let cafesData = [];
let visibleCafes = [];
let currentSort = "distance";
let searchTerm = "";
let activeCafeId = null;
let searchDebounceTimer;

const favorites = new Set(
  (JSON.parse(localStorage.getItem("cafeFavorites")) || []).map(String),
);
const markerById = new Map();
const cafeById = new Map();

const elements = {
  cafeList: document.getElementById("cafeList"),
  cafeCount: document.getElementById("cafeCount"),
  loading: document.getElementById("loading"),
  noResults: document.getElementById("noResults"),
  searchInput: document.getElementById("searchInput"),
  radius: document.getElementById("radius"),
  sortBy: document.getElementById("sortBy"),
  darkToggle: document.getElementById("darkToggle"),
};

const map = L.map("map");

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    function (position) {
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
        .bindPopup("You are here")
        .openPopup();

      findCafes(currentLat, currentLon);
    },
    function () {
      elements.loading.style.display = "none";
      elements.noResults.textContent = "Location permission is required to find cafes.";
      elements.noResults.style.display = "block";
    },
  );
}

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

function createMarker(cafe) {
  return L.marker([cafe.lat, cafe.lon]).bindPopup(
    `${cafe.name}<br>${cafe.distance.toFixed(2)} km away`,
  );
}

function clearAllCafeMarkers() {
  markerById.forEach((marker) => {
    if (map.hasLayer(marker)) {
      map.removeLayer(marker);
    }
  });
  markerById.clear();
}

function syncVisibleMarkers(cafes) {
  const visibleIds = new Set(cafes.map((cafe) => String(cafe.id)));

  markerById.forEach((marker, cafeId) => {
    if (!visibleIds.has(cafeId) && map.hasLayer(marker)) {
      map.removeLayer(marker);
    }
  });

  cafes.forEach((cafe) => {
    const cafeId = String(cafe.id);
    let marker = markerById.get(cafeId);

    if (!marker) {
      marker = createMarker(cafe);
      markerById.set(cafeId, marker);
    }

    if (!map.hasLayer(marker)) {
      marker.addTo(map);
    }
  });
}

function sortCafes(cafes) {
  if (currentSort === "name") {
    return [...cafes].sort((a, b) => a.name.localeCompare(b.name));
  }

  return [...cafes].sort((a, b) => a.distance - b.distance);
}

function updateCafeCount(visibleCount, totalCount) {
  if (visibleCount !== totalCount) {
    elements.cafeCount.textContent = `${visibleCount} of ${totalCount} Cafes`;
    return;
  }

  elements.cafeCount.textContent =
    `${visibleCount} ${visibleCount === 1 ? "Cafe" : "Cafes"}`;
}

function renderCafeList(cafes) {
  elements.cafeList.innerHTML = "";

  const fragment = document.createDocumentFragment();

  cafes.forEach((cafe, index) => {
    const cafeId = String(cafe.id);
    const isFavorited = favorites.has(cafeId);

    const li = document.createElement("li");
    li.dataset.cafeId = cafeId;
    li.style.setProperty("--delay", `${Math.min(index, 12) * 30}ms`);
    li.innerHTML = `
      <h3 class="cafe-name">${cafe.name}</h3>
      <div class="cafe-distance">${cafe.distance.toFixed(2)} km away</div>
      <div class="cafe-actions">
        <button class="btn-directions" data-action="directions" data-lat="${cafe.lat}" data-lon="${cafe.lon}">Directions</button>
        <button class="btn-favorite ${isFavorited ? "favorited" : ""}" data-action="favorite" data-cafe-id="${cafeId}">${isFavorited ? "Saved" : "Save"}</button>
      </div>
    `;

    if (activeCafeId === cafeId) {
      li.classList.add("activeCafe");
    }

    fragment.appendChild(li);
  });

  elements.cafeList.appendChild(fragment);
}

function applyFiltersAndSort() {
  const filtered = cafesData.filter((cafe) =>
    cafe.name.toLowerCase().includes(searchTerm),
  );

  visibleCafes = sortCafes(filtered);
  renderCafeList(visibleCafes);
  syncVisibleMarkers(visibleCafes);
  updateCafeCount(visibleCafes.length, cafesData.length);

  elements.noResults.style.display = visibleCafes.length ? "none" : "block";
}

async function findCafes(userLat, userLon, radius = 5000) {
  elements.loading.style.display = "block";
  elements.noResults.style.display = "none";

  clearAllCafeMarkers();
  activeCafeId = null;

  if (radiusCircle) {
    map.removeLayer(radiusCircle);
  }

  radiusCircle = L.circle([userLat, userLon], {
    radius,
    color: "#339af0",
    weight: 2,
    fillColor: "#74c0fc",
    fillOpacity: 0.08,
  }).addTo(map);

  const query = `
    [out:json];
    node["amenity"="cafe"](around:${radius}, ${userLat}, ${userLon});
    out;
  `;

  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: query,
    });

    const data = await res.json();
    const cafesWithDistance = [];

    data.elements.forEach((cafe) => {
      if (cafe.lat && cafe.lon) {
        cafesWithDistance.push({
          id: cafe.id,
          name: cafe.tags.name || "Unnamed Cafe",
          lat: cafe.lat,
          lon: cafe.lon,
          distance: calculateDistance(userLat, userLon, cafe.lat, cafe.lon),
        });
      }
    });

    cafesData = cafesWithDistance;
    cafeById.clear();
    cafesData.forEach((cafe) => cafeById.set(String(cafe.id), cafe));

    applyFiltersAndSort();
  } catch {
    elements.noResults.textContent = "Unable to load cafes right now.";
    elements.noResults.style.display = "block";
  } finally {
    elements.loading.style.display = "none";
  }
}

function getDirections(lat, lon) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
  window.open(url, "_blank");
}

function persistFavorites() {
  localStorage.setItem("cafeFavorites", JSON.stringify([...favorites]));
}

function handleFavoriteToggle(cafeId, button) {
  if (favorites.has(cafeId)) {
    favorites.delete(cafeId);
    button.classList.remove("favorited");
    button.textContent = "Save";
  } else {
    favorites.add(cafeId);
    button.classList.add("favorited");
    button.textContent = "Saved";
  }

  persistFavorites();
}

function setActiveCafe(cafeId) {
  const currentActive = elements.cafeList.querySelector("li.activeCafe");
  if (currentActive) {
    currentActive.classList.remove("activeCafe");
  }

  const nextActive = elements.cafeList.querySelector(`li[data-cafe-id="${cafeId}"]`);
  if (nextActive) {
    nextActive.classList.add("activeCafe");
  }

  activeCafeId = cafeId;

  const cafe = cafeById.get(cafeId);
  const marker = markerById.get(cafeId);
  if (!cafe || !marker) {
    return;
  }

  map.setView([cafe.lat, cafe.lon], 17);
  marker.openPopup();
}

function debounce(fn, delay) {
  return function (...args) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => fn(...args), delay);
  };
}

elements.cafeList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (button) {
    event.stopPropagation();

    if (button.dataset.action === "directions") {
      getDirections(button.dataset.lat, button.dataset.lon);
      return;
    }

    if (button.dataset.action === "favorite") {
      handleFavoriteToggle(button.dataset.cafeId, button);
    }

    return;
  }

  const li = event.target.closest("li[data-cafe-id]");
  if (!li) {
    return;
  }

  setActiveCafe(li.dataset.cafeId);
});

elements.radius.addEventListener("change", function () {
  if (currentLat == null || currentLon == null) {
    return;
  }

  findCafes(currentLat, currentLon, Number.parseInt(this.value, 10));
});

elements.sortBy.addEventListener("change", function () {
  currentSort = this.value;
  applyFiltersAndSort();
});

elements.searchInput.addEventListener(
  "input",
  debounce(function (event) {
    searchTerm = event.target.value.trim().toLowerCase();
    applyFiltersAndSort();
  }, 160),
);

elements.darkToggle.addEventListener("click", function () {
  const isDark = document.documentElement.classList.toggle("dark");
  this.textContent = isDark ? "Light" : "Dark";
});
