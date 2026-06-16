// static/app.js

let mapInstance = null;
let layerCounter = 0;

function initMap() {
    mapInstance = L.map('map').setView([0, 0], 2);
    
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors', maxZoom: 19
    });
    
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri', maxZoom: 19
    });

    // Crear el menú unificado
    window.mainMenu = new L.Control.MainMenu({ position: 'topright' }).addTo(mapInstance);
    
    // Registrar mapas base
    window.mainMenu.addBaseMap(osmLayer, "Callejero (OSM)");
    window.mainMenu.addBaseMap(satelliteLayer, "Satélite (Esri)");
}

function addLayerToMap(geojsonData, originalFileName) {
    layerCounter++;
    const layerName = originalFileName ? originalFileName.replace(/\.(geo)?json$/, '') : `Capa ${layerCounter}`;

    const newLayer = L.geoJSON(geojsonData, {
        style: { color: "#2563eb", weight: 2, fillColor: "#3b82f6", fillOpacity: 0.4 },
        onEachFeature: function (feature, layer) {
            if (feature.properties) {
                let popupContent = "<div style='min-width: 150px;'><b>Propiedades:</b><br><ul style='margin: 5px 0; padding-left: 20px; font-size: 0.9em;'>";
                let hasData = false;
                let firstPropertyFound = null;

                for (let key in feature.properties) {
                    const value = feature.properties[key];
                    if (value !== null && value !== undefined && value !== "") {
                        const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                        popupContent += `<li style="margin-bottom: 4px;"><b>${formattedKey}:</b> ${value}</li>`;
                        if (!firstPropertyFound) firstPropertyFound = value;
                        hasData = true;
                    }
                }
                popupContent += "</ul></div>";

                if (hasData) layer.bindPopup(popupContent);
                if (firstPropertyFound) layer.bindTooltip(String(firstPropertyFound), { sticky: true, direction: 'top', offset: [0, -10] });
            }
        }
    }).addTo(mapInstance);

    window.mainMenu.addLayer(newLayer, layerName);

    if (newLayer.getBounds().isValid()) {
        mapInstance.fitBounds(newLayer.getBounds(), { padding: [50, 50] });
    }
}

window.removeLayer = function(layerId) {
    const layer = mapInstance._layers[layerId];
    if (layer) {
        mapInstance.removeLayer(layer);
        if (window.mainMenu) window.mainMenu.removeLayer(layerId);
        if(window.showToast) window.showToast("Capa eliminada", "success", 2000);
    }
};

window.moveLayerToFront = function(layerId) {
    const layer = mapInstance._layers[layerId];
    if (layer) {
        layer.bringToFront();
        if(window.showToast) window.showToast("Capa movida al frente", "success", 2000);
    }
};

window.moveLayerToBack = function(layerId) {
    const layer = mapInstance._layers[layerId];
    if (layer) {
        layer.bringToBack();
        if(window.showToast) window.showToast("Capa movida al fondo", "success", 2000);
    }
};

function showToast(message, type = 'success', duration = 4000) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✅', warning: '⚠️', error: '❌' };
    toast.innerHTML = `<strong>${icons[type]}</strong> <span style="font-size: 0.85rem;">${message}</span>`;
    container.appendChild(toast);
    if (duration > 0) {
        setTimeout(() => {
            toast.classList.add('hiding');
            toast.addEventListener('animationend', () => toast.remove());
        }, duration);
    }
}

window.showToast = showToast;
window.addLayerToMap = addLayerToMap;

initMap();