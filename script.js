let currentLat;
let currentLon;
let radiusCircle;
let cafesData = [];
let visibleCafes = [];
let currentSort = "distance";
let searchTerm = "";
let activeFilter = "all";
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
  filterTabs: document.querySelectorAll(".filter-tab"),
  searchInput: document.getElementById("searchInput"),
  radius: document.getElementById("radius"),
  radiusLabel: document.getElementById("radiusLabel"),
  savedCount: document.getElementById("savedCount"),
  sortBy: document.getElementById("sortBy"),
  visibleCount: document.getElementById("visibleCount"),
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
  elements.visibleCount.textContent = visibleCount;

  if (visibleCount !== totalCount) {
    elements.cafeCount.textContent = `${visibleCount} of ${totalCount} Cafes`;
    return;
  }

  elements.cafeCount.textContent =
    `${visibleCount} ${visibleCount === 1 ? "Cafe" : "Cafes"}`;
}

function updateSavedCount() {
  elements.savedCount.textContent = favorites.size;
}

function updateNoResultsMessage() {
  if (activeFilter === "saved" && searchTerm) {
    elements.noResults.textContent = "No saved cafes match your search.";
    return;
  }

  if (activeFilter === "saved") {
    elements.noResults.textContent = "No saved cafes yet.";
    return;
  }

  elements.noResults.textContent = searchTerm
    ? "No cafes match your search."
    : "No cafes found";
}

function getWalkingEta(distanceKm) {
  return Math.max(1, Math.round((distanceKm / 4.8) * 60));
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
      <div class="cafe-card-top">
        <h3 class="cafe-name">${cafe.name}</h3>
        <span class="cafe-rank">#${index + 1}</span>
      </div>
      <div class="cafe-meta">
        <span>${cafe.distance.toFixed(2)} km</span>
        <span>${getWalkingEta(cafe.distance)} min walk</span>
      </div>
      <div class="cafe-actions">
        <button class="btn-directions" data-action="directions" data-lat="${cafe.lat}" data-lon="${cafe.lon}">Open route</button>
        <button class="btn-favorite ${isFavorited ? "favorited" : ""}" data-action="favorite" data-cafe-id="${cafeId}" aria-label="${isFavorited ? "Remove saved cafe" : "Save cafe"}">${isFavorited ? "Saved" : "Save"}</button>
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
  const filtered = cafesData.filter((cafe) => {
    const matchesSearch = cafe.name.toLowerCase().includes(searchTerm);
    const matchesFilter =
      activeFilter === "all" || favorites.has(String(cafe.id));

    return matchesSearch && matchesFilter;
  });

  visibleCafes = sortCafes(filtered);
  renderCafeList(visibleCafes);
  syncVisibleMarkers(visibleCafes);
  updateCafeCount(visibleCafes.length, cafesData.length);
  updateNoResultsMessage();

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
  updateSavedCount();
}

function handleFavoriteToggle(cafeId, button) {
  if (favorites.has(cafeId)) {
    favorites.delete(cafeId);
    button.classList.remove("favorited");
    button.textContent = "Save";
    button.setAttribute("aria-label", "Save cafe");
  } else {
    favorites.add(cafeId);
    button.classList.add("favorited");
    button.textContent = "Saved";
    button.setAttribute("aria-label", "Remove saved cafe");
  }

  persistFavorites();

  if (activeFilter === "saved") {
    applyFiltersAndSort();
  }
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

  elements.radiusLabel.textContent = this.options[this.selectedIndex].textContent;
  findCafes(currentLat, currentLon, Number.parseInt(this.value, 10));
});

elements.sortBy.addEventListener("change", function () {
  currentSort = this.value;
  applyFiltersAndSort();
});

elements.filterTabs.forEach((tab) => {
  tab.addEventListener("click", function () {
    elements.filterTabs.forEach((filterTab) =>
      filterTab.classList.toggle("active", filterTab === this),
    );

    activeFilter = this.dataset.filter;
    applyFiltersAndSort();
  });
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

updateSavedCount();
