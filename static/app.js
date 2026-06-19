// static/app.js

let mapInstance = null;
let layerCounter = 0;
window.lastLoadedLayer = null;

// ============================================================
// 🆕 VARIABLES GLOBALES DE RUTEo
// ============================================================
window.activeNetwork = null;  // Nombre de la red activa (ej: "net_a1b2c3d4")
let networkLayer = null;      // Capa Leaflet de la red activa

function initMap() {
    mapInstance = L.map('map').setView([0, 0], 2);
    window.mapInstance = mapInstance;

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

        window.lastLoadedLayer = {
        layer: newLayer,
        layerId: newLayer._leaflet_id,
        name: layerName
    };

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

// ============================================================
// 🆕 FUNCIONES DE RUTEo
// ============================================================

/**
 * Activa una red para ruteo
 */
window.setActiveNetwork = async function(tableName) {
    try {
        // Cargar GeoJSON de la red
        const response = await fetch(`/api/networks/${tableName}/geojson`);
        if (!response.ok) throw new Error('Error cargando red');
        
        const geojson = await response.json();
        
        // Remover capa anterior si existe
        if (networkLayer) {
            mapInstance.removeLayer(networkLayer);
        }
        
        // Crear nueva capa
        networkLayer = L.geoJSON(geojson, {
            style: { 
                color: "#16a34a", 
                weight: 3, 
                opacity: 0.7 
            },
            onEachFeature: function(feature, layer) {
                layer.bindTooltip(`Arista #${feature.properties.gid}`, { sticky: true });
            }
        }).addTo(mapInstance);
        
        // Ajustar vista
        if (networkLayer.getBounds().isValid()) {
            mapInstance.fitBounds(networkLayer.getBounds(), { padding: [50, 50] });
        }
        
        // Guardar red activa
        window.activeNetwork = tableName;
        
        if(window.showToast) {
            window.showToast(`🛣️ Red activa: ${tableName}`, 'success', 3000);
        }
        
        // Refrescar lista del menú
        if (window.mainMenu) {
            window.mainMenu._loadNetworksList();
        }
        
        console.log('✅ Red activa:', tableName);
        
    } catch (err) {
        if(window.showToast) window.showToast(`❌ Error: ${err.message}`, 'error', 4000);
    }
};

/**
 * Elimina una red
 */
window.deleteNetwork = async function(tableName) {
    if (!confirm(`¿Eliminar la red "${tableName}"?`)) return;
    
    try {
        const response = await fetch(`/api/networks/${tableName}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Error eliminando red');
        
        // Si era la red activa, desactivarla
        if (window.activeNetwork === tableName) {
            window.activeNetwork = null;
            if (networkLayer) {
                mapInstance.removeLayer(networkLayer);
                networkLayer = null;
            }
        }
        
        if(window.showToast) {
            window.showToast(`🗑️ Red eliminada: ${tableName}`, 'success', 3000);
        }
        
        // Refrescar lista
        if (window.mainMenu) {
            window.mainMenu._loadNetworksList();
        }
        
    } catch (err) {
        if(window.showToast) window.showToast(`❌ Error: ${err.message}`, 'error', 4000);
    }
};

/**
 * Obtiene el nodo más cercano en la red activa
 */
window.getNearestNode = async function(lng, lat) {
    if (!window.activeNetwork) {
        throw new Error('No hay red activa. Carga una red primero.');
    }
    
    const response = await fetch(
        `/api/networks/${window.activeNetwork}/nearest-node?lon=${lng}&lat=${lat}`
    );
    
    if (!response.ok) {
        throw new Error('No se encontró nodo cercano');
    }
    
    return await response.json();
};

/**
 * Calcula la ruta más corta en la red activa
 */
window.calculateShortestPath = async function(startNode, endNode) {
    if (!window.activeNetwork) {
        throw new Error('No hay red activa. Carga una red primero.');
    }
    
    const response = await fetch(
        `/api/networks/${window.activeNetwork}/shortest-path`, 
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ start_node: startNode, end_node: endNode })
        }
    );
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Error calculando ruta');
    }
    
    return await response.json();
};

/**
 * Calcula ruta TSP en la red activa
 */
window.calculateTSP = async function(waypoints, startNode) {
    if (!window.activeNetwork) {
        throw new Error('No hay red activa. Carga una red primero.');
    }
    
    const response = await fetch(
        `/api/networks/${window.activeNetwork}/tsp`, 
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                waypoints: waypoints, 
                start_node: startNode 
            })
        }
    );
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Error calculando ruta TSP');
    }
    
    return await response.json();
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