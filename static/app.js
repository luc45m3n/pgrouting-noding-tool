// static/app.js

let mapInstance = null;
let layerCounter = 0;
let routingPanel = null;
let networkLayer = null;

window.lastLoadedLayer = null;
window.activeNetwork = null;
window.routingPanel = null;

function initMap() {
    mapInstance = L.map('map').setView([0, 0], 2);
    window.mapInstance = mapInstance;
    
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors', maxZoom: 19
    });
    
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri', maxZoom: 19
    });

    window.mainMenu = new L.Control.MainMenu({ position: 'topright' }).addTo(mapInstance);
    
    window.mainMenu.addBaseMap(osmLayer, i18n.t('menu.basemap.osm'));
    window.mainMenu.addBaseMap(satelliteLayer, i18n.t('menu.basemap.satellite'));
    
    // ✅ Crear panel de ruteo DESPUÉS de que mapInstance existe
    if (typeof RoutingPanel !== 'undefined') {
        routingPanel = new RoutingPanel(mapInstance);
        window.routingPanel = routingPanel;
        console.log(i18n.t('menu.routing_created'));
    } else {
        console.error(i18n.t('menu.routing_not_defined'));
    }
}

function addLayerToMap(geojsonData, originalFileName) {
    layerCounter++;
    const layerName = originalFileName ? originalFileName.replace(/\.(geo)?json$/, '') : i18n.t('menu.layer') + ' ' + layerCounter;

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
                        popupContent += '<li style="margin-bottom: 4px;"><b>' + formattedKey + ':</b> ' + value + '</li>';
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
        if(window.showToast) window.showToast(i18n.t('menu.layer_removed'), i18n.t('menu.success'), 2000);
    }
};

window.moveLayerToFront = function(layerId) {
    const layer = mapInstance._layers[layerId];
    if (layer) {
        layer.bringToFront();
        if(window.showToast) window.showToast(i18n.t('menu.layer_moved_to_front'), i18n.t('menu.success'), 2000);
    }
};

window.moveLayerToBack = function(layerId) {
    const layer = mapInstance._layers[layerId];
    if (layer) {
        layer.bringToBack();
        if(window.showToast) window.showToast(i18n.t('menu.layer_moved_to_back'), i18n.t('menu.success'), 2000);
    }
};

window.setActiveNetwork = async function(tableName) {
    try {
        const response = await fetch('/api/networks/' + tableName + '/geojson');
        if (!response.ok) throw new Error(i18n.t('menu.network_load_error'));
        
        const geojson = await response.json();
        
        if (networkLayer) {
            mapInstance.removeLayer(networkLayer);
        }
        
        networkLayer = L.geoJSON(geojson, {
            style: { 
                color: "#16a34a", 
                weight: 3, 
                opacity: 0.7 
            },
            onEachFeature: function(feature, layer) {
                layer.bindTooltip('Arista #' + feature.properties.gid, { sticky: true });
            }
        }).addTo(mapInstance);
        
        if (networkLayer.getBounds().isValid()) {
            mapInstance.fitBounds(networkLayer.getBounds(), { padding: [50, 50] });
        }
        
        window.activeNetwork = tableName;
        
        if(window.showToast) {
            window.showToast(i18n.t('menu.network_activated') + ': ' + tableName, i18n.t('menu.success'), 3000);
        }
        
        if (window.mainMenu) {
            window.mainMenu._loadNetworksList();
        }
        
        // ✅ MOSTRAR PANEL DE RUTEO AUTOMÁTICAMENTE
        if (window.routingPanel) {
            window.routingPanel.updateNetworkStatus();
        }
        
        // ✅ MOSTRAR PANEL DE RUTEO Y ACTUALIZAR ESTADO
        if (window.routingPanel) {
            window.routingPanel.show();  // ← ESTO HACE VISIBLE EL PANEL
        }
        
        console.log('Red activa:', tableName);
        
    } catch (err) {
        if(window.showToast) window.showToast(i18n.t('menu.error') + ': ' + err.message, i18n.t('menu.error'), 4000);
    }
};

window.deleteNetwork = async function(tableName) {
    if (!confirm('¿Eliminar la red "' + tableName + '"?')) return;
    
    try {
        const response = await fetch('/api/networks/' + tableName, { method: 'DELETE' });
        if (!response.ok) throw new Error(i18n.t('menu.network_delete_error'));
        
        if (window.activeNetwork === tableName) {
            window.activeNetwork = null;
            if (networkLayer) {
                mapInstance.removeLayer(networkLayer);
                networkLayer = null;
            }
            
            // ✅ OCULTAR PANEL DE RUTEO
            if (window.routingPanel) {
                window.routingPanel.hide();
            }
        }
        
        if(window.showToast) {
            window.showToast(i18n.t('menu.network_deleted') + ': ' + tableName, i18n.t('menu.success'), 3000);
        }
        
        if (window.mainMenu) {
            window.mainMenu._loadNetworksList();
        }
        
    } catch (err) {
        if(window.showToast) window.showToast(i18n.t('menu.error') + ': ' + err.message, i18n.t('menu.error'), 4000);
    }
};

window.getNearestNode = async function(lng, lat) {
    if (!window.activeNetwork) {
        throw new Error(i18n.t('menu.no_active_network'));
    }
    
    const response = await fetch(
        '/api/networks/' + window.activeNetwork + '/nearest-node?lon=' + lng + '&lat=' + lat
    );
    
    if (!response.ok) {
        throw new Error(i18n.t('menu.no_nearest_node'));
    }
    
    return await response.json();
};

window.calculateShortestPath = async function(startNode, endNode) {
    if (!window.activeNetwork) {
        throw new Error(i18n.t('menu.no_active_network'));
    }
    
    const response = await fetch(
        '/api/networks/' + window.activeNetwork + '/shortest-path', 
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ start_node: startNode, end_node: endNode })
        }
    );
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || i18n.t('menu.route_calculation_error'));
    }
    
    return await response.json();
};

window.calculateTSP = async function(waypoints, startNode) {
    if (!window.activeNetwork) {
        throw new Error(i18n.t('menu.no_active_network'));
    }
    
    const response = await fetch(
        '/api/networks/' + window.activeNetwork + '/tsp', 
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
        throw new Error(error.detail || i18n.t('menu.tsp_calculation_error'));
    }
    
    return await response.json();
};

function showToast(message, type, duration) {
    type = type || 'success';
    duration = duration || 4000;
    
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    const icons = { success: 'OK', warning: '!', error: 'X' };
    toast.innerHTML = '<strong>' + (icons[type] || 'OK') + '</strong> <span style="font-size: 0.85rem;">' + message + '</span>';
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

// ✅ Inicializar el mapa (esto crea routingPanel internamente)
initMap();