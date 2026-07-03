// static/routing_panel.js
// Panel flotante arrastrable para ruteo con Dijkstra y TSP

// ✅ NUEVO: Extrae todas las coordenadas de un GeoJSON y las convierte a [lat, lng]
function getRouteCoordinates(geojson) {
    let allCoords = [];
    
    const processCoords = (coords) => {
        // GeoJSON viene como [lng, lat], Leaflet necesita [lat, lng]
        coords.forEach(c => allCoords.push([c[1], c[0]]));
    };

    if (geojson.type === 'FeatureCollection') {
        geojson.features.forEach(f => {
            if (f.geometry.type === 'LineString') processCoords(f.geometry.coordinates);
            else if (f.geometry.type === 'MultiLineString') f.geometry.coordinates.forEach(processCoords);
        });
    } else if (geojson.type === 'Feature') {
        if (geojson.geometry.type === 'LineString') processCoords(geojson.geometry.coordinates);
    } else if (geojson.type === 'LineString') {
        processCoords(geojson.coordinates);
    } else if (geojson.type === 'MultiLineString') {
        geojson.coordinates.forEach(processCoords);
    }
    
    return allCoords;
}

class RoutingPanel {
    constructor(map) {
        this.map = map;
        this.algorithm = 'dijkstra';
        this.waypoints = [];
        this.routeLayer = null;
        this.routeGeoJSON = null;
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.isVisible = false;
        
        this.createPanel();
        this.setupDrag();
        this.setupMapClicks();
    }
    
    createPanel() {
        this.panel = document.createElement('div');
        this.panel.className = 'routing-panel';
        this.panel.style.display = 'none';
        
        this.panel.innerHTML = `
            <div class="routing-panel-header">
                <h3>🗺️ Ruteo</h3>
                <div class="panel-controls">
                    <button id="routingMinimize" title="Minimizar">−</button>
                    <button id="routingClose" title="Cerrar">✕</button>
                </div>
            </div>
            <div class="routing-panel-body">
                <div id="routingNetworkStatus" class="network-status">
                    <strong>Red:</strong> <span id="routingNetworkName">Ninguna</span>
                </div>
                
                <div class="routing-form-group">
                    <label for="routingAlgorithm">Algoritmo:</label>
                    <select id="routingAlgorithm">
                        <option value="dijkstra">Dijkstra (Origen → Destino)</option>
                        <option value="tsp">TSP (Múltiples puntos)</option>
                    </select>
                </div>
                
                <div class="routing-instructions" id="routingInstructions">
                    <strong>📍 Modo Dijkstra:</strong><br>
                    Hacé click en el mapa para marcar <strong>origen</strong> y <strong>destino</strong>.
                </div>
                
                <div class="routing-form-group">
                    <label>Puntos seleccionados:</label>
                    <ul id="waypointsList" class="waypoints-list">
                        <li style="color: #999; font-size: 12px; text-align: center; padding: 8px;">
                            Sin puntos seleccionados
                        </li>
                    </ul>
                </div>
                
                <div class="routing-actions">
                    <button id="routingCalculate" class="routing-btn routing-btn-primary" disabled>
                         Calcular
                    </button>
                    <button id="routingClearPoints" class="routing-btn routing-btn-secondary">
                        ❌ Puntos
                    </button>
                    <button id="routingClearRoute" class="routing-btn routing-btn-danger">
                        ❌ Ruta
                    </button>
                </div>
                
                <!-- ✅ NUEVO: Botones de descarga (ocultos por defecto) -->
                <div class="routing-actions" id="downloadActions" style="display: none; margin-top: 8px;">
                    <button id="downloadGeoJSON" class="routing-btn routing-btn-secondary" style="flex: 1;">
                         Descargar GeoJSON
                    </button>
                    <button id="downloadGPX" class="routing-btn routing-btn-secondary" style="flex: 1;">
                         Descargar GPX
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.panel);
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        document.getElementById('routingMinimize').addEventListener('click', () => {
            this.panel.classList.toggle('collapsed');
        });
        
        document.getElementById('routingClose').addEventListener('click', () => {
            this.hide();
        });
        
        document.getElementById('routingAlgorithm').addEventListener('change', (e) => {
            this.algorithm = e.target.value;
            this.clearWaypoints();
            this.updateInstructions();
        });
        
        document.getElementById('routingCalculate').addEventListener('click', () => this.calculateRoute());
        document.getElementById('routingClearPoints').addEventListener('click', () => this.clearWaypoints());
        document.getElementById('routingClearRoute').addEventListener('click', () => this.clearRoute());
        
        // ✅ NUEVO: Event listeners de descarga
        document.getElementById('downloadGeoJSON').addEventListener('click', () => this.downloadRoute('geojson'));
        document.getElementById('downloadGPX').addEventListener('click', () => this.downloadRoute('gpx'));
    }
    
    setupDrag() {
        const header = this.panel.querySelector('.routing-panel-header');
        
        header.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            
            this.isDragging = true;
            
            const rect = this.panel.getBoundingClientRect();
            this.dragOffset = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
            
            this.panel.style.transition = 'none';
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            
            const x = e.clientX - this.dragOffset.x;
            const y = e.clientY - this.dragOffset.y;
            
            this.panel.style.left = x + 'px';
            this.panel.style.top = y + 'px';
        });
        
        document.addEventListener('mouseup', () => {
            this.isDragging = false;
            this.panel.style.transition = '';
        });
    }
    
    setupMapClicks() {
        this.map.on('click', (e) => {
            if (!this.isVisible) return;
            if (!window.activeNetwork) {
                if (window.showToast) {
                    window.showToast('⚠️ Primero cargá una red ruteable', 'warning', 3000);
                }
                return;
            }
            
            this.addWaypoint(e.latlng.lng, e.latlng.lat);
        });
    }
    
    updateInstructions() {
        const instructions = document.getElementById('routingInstructions');
        if (this.algorithm === 'dijkstra') {
            instructions.innerHTML = `
                <strong> Modo Dijkstra:</strong><br>
                Hacé click en el mapa para marcar <strong>origen</strong> y <strong>destino</strong>.
            `;
        } else {
            instructions.innerHTML = `
                <strong>️ Modo TSP:</strong><br>
                Hacé click en el mapa para agregar <strong>múltiples puntos</strong> de visita (mínimo 2).
            `;
        }
    }
    
    async addWaypoint(lng, lat) {
        if (!window.activeNetwork) return;
        
        if (this.algorithm === 'dijkstra' && this.waypoints.length >= 2) {
            if (window.showToast) {
                window.showToast('⚠️ Dijkstra solo necesita 2 puntos (origen y destino)', 'warning', 3000);
            }
            return;
        }
        
        try {
            if (window.showToast) {
                window.showToast('🔍 Buscando nodo más cercano...', 'success', 2000);
            }
            
            const node = await window.getNearestNode(lng, lat);
            
            const markerType = this.getMarkerType(this.waypoints.length);
            const marker = L.marker([lat, lng], {
                icon: L.divIcon({
                    className: `marker-${markerType}`,
                    iconSize: [16, 16],
                    iconAnchor: [8, 8]
                })
            }).addTo(this.map);
            
            marker.bindPopup(`
                <strong>${this.getWaypointLabel(this.waypoints.length)}</strong><br>
                Nodo ID: ${node.id}<br>
                Lat: ${lat.toFixed(6)}<br>
                Lng: ${lng.toFixed(6)}
            `);
            
            this.waypoints.push({
                lng,
                lat,
                nodeId: node.id,
                marker,
                type: markerType
            });
            
            this.renderWaypointsList();
            this.updateCalculateButton();
            
        } catch (err) {
            console.error('Error agregando waypoint:', err);
            if (window.showToast) {
                window.showToast(`❌ Error: ${err.message}`, 'error', 4000);
            }
        }
    }
    
    getMarkerType(index) {
        if (this.algorithm === 'dijkstra') {
            return index === 0 ? 'origin' : 'destination';
        }
        return 'waypoint';
    }
    
    getWaypointLabel(index) {
        if (this.algorithm === 'dijkstra') {
            return index === 0 ? '🟢 Origen' : '🔴 Destino';
        }
        return `📍 Punto ${index + 1}`;
    }
    
    renderWaypointsList() {
        const list = document.getElementById('waypointsList');
        
        if (this.waypoints.length === 0) {
            list.innerHTML = `
                <li style="color: #999; font-size: 12px; text-align: center; padding: 8px;">
                    Sin puntos seleccionados
                </li>
            `;
            return;
        }
        
        list.innerHTML = this.waypoints.map((wp, index) => `
            <li class="waypoint-item ${wp.type}">
                <span class="wp-number">${index + 1}</span>
                <span class="wp-coords">
                    ${this.getWaypointLabel(index)}<br>
                    Nodo: ${wp.nodeId}
                </span>
                <button class="wp-remove" data-index="${index}" title="Eliminar">
                    ✕
                </button>
            </li>
        `).join('');
        
        list.querySelectorAll('.wp-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.getAttribute('data-index'));
                this.removeWaypoint(index);
            });
        });
    }
    
    removeWaypoint(index) {
        const wp = this.waypoints[index];
        if (wp.marker) {
            this.map.removeLayer(wp.marker);
        }
        this.waypoints.splice(index, 1);
        this.renderWaypointsList();
        this.updateCalculateButton();
    }
    
    clearWaypoints() {
        this.waypoints.forEach(wp => {
            if (wp.marker) this.map.removeLayer(wp.marker);
        });
        this.waypoints = [];
        this.renderWaypointsList();
        this.updateCalculateButton();
    }
    
    // ✅ MODIFICADO: clearRoute ahora oculta los botones de descarga
    clearRoute() {
        if (this.routeLayer) {
            this.map.removeLayer(this.routeLayer);
            this.routeLayer = null;
        }
        this.routeGeoJSON = null;  // ✅ NUEVO: limpiar GeoJSON guardado
        this.hideDownloadButtons();
    }
    
    updateCalculateButton() {
        const btn = document.getElementById('routingCalculate');
        const minPoints = 2;
        btn.disabled = this.waypoints.length < minPoints;
    }
    
    async calculateRoute() {
        if (this.waypoints.length < 2) return;
        
        const btn = document.getElementById('routingCalculate');
        btn.disabled = true;
        btn.innerHTML = '<div class="routing-loading"><div class="spinner"></div>Calculando...</div>';
        
        try {
            this.clearRoute();
            
            if (this.algorithm === 'dijkstra') {
                await this.calculateDijkstra();
            } else {
                await this.calculateTSP();
            }
            
        } catch (err) {
            console.error('Error calculando ruta:', err);
            if (window.showToast) {
                window.showToast(`❌ Error: ${err.message}`, 'error', 5000);
            }
        } finally {
            btn.disabled = false;
            btn.innerHTML = ' Calcular';
        }
    }
    
    // ✅ MODIFICADO: muestra botones de descarga al terminar
        async calculateDijkstra() {
        const startNode = this.waypoints[0].nodeId;
        const endNode = this.waypoints[1].nodeId;
        
        const result = await window.calculateShortestPath(startNode, endNode);
        const geomObject = typeof result.geom === 'string' ? JSON.parse(result.geom) : result.geom;
        
        const totalDistance = this.calculateTotalDistance(geomObject);
        const distanceText = totalDistance < 1000 
            ? `${totalDistance.toFixed(0)} m` 
            : `${(totalDistance / 1000).toFixed(2)} km`;

        const routeCoords = getRouteCoordinates(geomObject);
        
        // ✅ CAMBIO CLAVE: usar L.featureGroup() en lugar de L.layerGroup()
        const routeGroup = L.featureGroup();

        const visibleLayer = L.polyline(routeCoords, {
            color: '#667eea',
            weight: 5,
            opacity: 0.8,
            lineCap: 'round',
            lineJoin: 'round'
        });

        const hitAreaLayer = L.polyline(routeCoords, {
            color: 'transparent',
            weight: 25,
            opacity: 0,
            interactive: true
        });

        hitAreaLayer.bindTooltip(` Distancia total: ${distanceText}`, {
            sticky: true,
            direction: 'top',
            offset: [0, -10],
            className: 'route-tooltip'
        });

        hitAreaLayer.on('mouseover', function () {
            visibleLayer.setStyle({ weight: 8, color: '#ff6b6b', opacity: 1 });
            document.body.style.cursor = 'pointer';
        });

        hitAreaLayer.on('mouseout', function () {
            visibleLayer.setStyle({ weight: 5, color: '#667eea', opacity: 0.8 });
            document.body.style.cursor = '';
        });

        routeGroup.addLayer(visibleLayer);
        routeGroup.addLayer(hitAreaLayer);
        routeGroup.addTo(this.map);

        this.routeLayer = routeGroup;
        this.routeGeoJSON = geomObject;

        // ✅ Ahora sí funciona getBounds()
        if (routeGroup.getBounds().isValid()) {
            this.map.fitBounds(routeGroup.getBounds(), { padding: [50, 50] });
        }

        if (window.showToast) {
            window.showToast(`✅ Ruta: ${distanceText}`, 'success', 4000);
        }

        this.showDownloadButtons();
    }
    
    // ✅ MODIFICADO: muestra botones de descarga al terminar
        async calculateTSP() {
        const nodeIds = this.waypoints.map(wp => wp.nodeId);
        
        const result = await window.calculateTSP(nodeIds, nodeIds[0]);
        
        const totalDistance = this.calculateTotalDistance(result.geojson);
        const distanceText = totalDistance < 1000 
            ? `${totalDistance.toFixed(0)} m` 
            : `${(totalDistance / 1000).toFixed(2)} km`;

        const routeCoords = getRouteCoordinates(result.geojson);
        
        // ✅ CAMBIO CLAVE: usar L.featureGroup()
        const routeGroup = L.featureGroup();

        const visibleLayer = L.polyline(routeCoords, {
            color: '#667eea',
            weight: 5,
            opacity: 0.8,
            lineCap: 'round',
            lineJoin: 'round',
            dashArray: '10, 5'
        });

        const hitAreaLayer = L.polyline(routeCoords, {
            color: 'transparent',
            weight: 25,
            opacity: 0,
            interactive: true
        });

        hitAreaLayer.bindTooltip(` Distancia total: ${distanceText}`, {
            sticky: true,
            direction: 'top',
            offset: [0, -10],
            className: 'route-tooltip'
        });

        hitAreaLayer.on('mouseover', function () {
            visibleLayer.setStyle({ weight: 8, color: '#ff6b6b', opacity: 1, dashArray: '10, 5' });
            document.body.style.cursor = 'pointer';
        });

        hitAreaLayer.on('mouseout', function () {
            visibleLayer.setStyle({ weight: 5, color: '#667eea', opacity: 0.8, dashArray: '10, 5' });
            document.body.style.cursor = '';
        });

        routeGroup.addLayer(visibleLayer);
        routeGroup.addLayer(hitAreaLayer);
        routeGroup.addTo(this.map);

        this.routeLayer = routeGroup;
        this.routeGeoJSON = result.geojson;  // ✅ CORREGIDO: era geomObject (no existía)

        if (routeGroup.getBounds().isValid()) {
            this.map.fitBounds(routeGroup.getBounds(), { padding: [50, 50] });
        }

        if (window.showToast) {
            window.showToast(`✅ TSP: ${result.tsp_order.length} puntos, ${distanceText}`, 'success', 4000);
        }

        this.showDownloadButtons();
    }

    // ✅ MEJORADO: Maneja LineString, MultiLineString y valida datos
    calculateDistanceMeters(geometry) {
        if (!geometry || !geometry.coordinates) return 0;
        
        let totalDistance = 0;
        const type = geometry.type;
        const coords = geometry.coordinates;
        
        // Función auxiliar para calcular distancia de una línea
        const lineDistance = (lineCoords) => {
            let dist = 0;
            for (let i = 0; i < lineCoords.length - 1; i++) {
                const p1 = L.latLng(lineCoords[i][1], lineCoords[i][0]);
                const p2 = L.latLng(lineCoords[i+1][1], lineCoords[i+1][0]);
                dist += p1.distanceTo(p2);
            }
            return dist;
        };
        
        if (type === 'LineString') {
            totalDistance = lineDistance(coords);
        } else if (type === 'MultiLineString') {
            coords.forEach(line => {
                totalDistance += lineDistance(line);
            });
        }
        
        return totalDistance;
    }
    
    // ✅ NUEVO: Calcular distancia total de todo el GeoJSON (FeatureCollection)
    calculateTotalDistance(geojson) {
        let total = 0;
        if (geojson.type === 'FeatureCollection' && geojson.features) {
            geojson.features.forEach(feature => {
                if (feature.geometry) {
                    total += this.calculateDistanceMeters(feature.geometry);
                }
            });
        } else if (geojson.type === 'LineString' || geojson.type === 'MultiLineString') {
            total = this.calculateDistanceMeters(geojson);
        }
        return total;
    }
    
    updateNetworkStatus() {
        const statusEl = document.getElementById('routingNetworkStatus');
        const nameEl = document.getElementById('routingNetworkName');
        
        if (window.activeNetwork) {
            statusEl.classList.remove('error');
            nameEl.textContent = window.activeNetwork;
        } else {
            statusEl.classList.add('error');
            nameEl.textContent = 'Ninguna (cargá una red primero)';
        }
    }
    
    show() {
        this.panel.style.display = 'block';
        this.isVisible = true;
        this.updateNetworkStatus();
        
        const toggleBtn = document.getElementById('toggleRoutingPanel');
        if (toggleBtn) toggleBtn.textContent = i18n.t('menu.hide_routing');
    }
    
    hide() {
        this.panel.style.display = 'none';
        this.isVisible = false;
        
        const toggleBtn = document.getElementById('toggleRoutingPanel');
        if (toggleBtn) toggleBtn.textContent = i18n.t('menu.routing');
    }
    
    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }
    
    // ✅ NUEVO: Métodos de descarga (agregar antes del cierre de la clase)
    
    showDownloadButtons() {
        const downloadActions = document.getElementById('downloadActions');
        if (downloadActions) {
            downloadActions.style.display = 'flex';
        }
    }
    
    hideDownloadButtons() {
        const downloadActions = document.getElementById('downloadActions');
        if (downloadActions) {
            downloadActions.style.display = 'none';
        }
    }
    
    downloadRoute(format) {
        if (!this.routeGeoJSON) {
            if (window.showToast) window.showToast(i18n.t('routing.noRoute'), 'warning', 3000);
            return;
        }
        
        try {
            // Obtener GeoJSON de la ruta (Leaflet ya está en WGS84)
            const geojson = JSON.parse(JSON.stringify(this.routeGeoJSON));
            
            // Si es FeatureCollection, agregar metadatos
            if (geojson.type === 'FeatureCollection') {
                geojson.properties = {
                    name: 'Ruta calculada',
                    description: 'Ruta generada con WebGIS Routing',
                    algorithm: this.algorithm,
                    timestamp: new Date().toISOString(),
                    network: window.activeNetwork || 'unknown'
                };
            }
            
            if (format === 'geojson') {
                this.downloadGeoJSON(geojson);
            } else if (format === 'gpx') {
                this.downloadGPX(geojson);
            }
            
            if (window.showToast) {
                window.showToast('Ruta descargada en formato ' + format.toUpperCase(), 'success', 3000);
            }
            
        } catch (err) {
            console.error('Error descargando ruta:', err);
            if (window.showToast) {
                window.showToast('Error al descargar: ' + err.message, 'error', 4000);
            }
        }
    }
    
    downloadGeoJSON(geojson) {
        const dataStr = JSON.stringify(geojson, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = 'ruta_' + Date.now() + '.geojson';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
    
    downloadGPX(geojson) {
        const gpx = this.geoJSONToGPX(geojson);
        
        const blob = new Blob([gpx], { type: 'application/gpx+xml' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = 'ruta_' + Date.now() + '.gpx';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
    
    geoJSONToGPX(geojson) {
        let gpx = '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n';
        gpx += '<gpx xmlns="http://www.topografix.com/GPX/1/1" creator="WebGIS Routing" version="1.1">\n';
        gpx += '  <metadata>\n';
        gpx += '    <name>' + (geojson.properties?.name || 'Ruta calculada') + '</name>\n';
        gpx += '    <desc>' + (geojson.properties?.description || '') + '</desc>\n';
        gpx += '    <time>' + (geojson.properties?.timestamp || new Date().toISOString()) + '</time>\n';
        gpx += '  </metadata>\n';
        
        if (geojson.features) {
            geojson.features.forEach((feature) => {
                const geom = feature.geometry;
                const props = feature.properties || {};
                
                if (geom.type === 'LineString') {
                    gpx += '  <trk>\n';
                    gpx += '    <name>' + (props.name || 'Ruta') + '</name>\n';
                    gpx += '    <trkseg>\n';
                    
                    geom.coordinates.forEach((coord) => {
                        // coord es [lng, lat] en WGS84
                        gpx += '      <trkpt lat="' + coord[1] + '" lon="' + coord[0] + '"></trkpt>\n';
                    });
                    
                    gpx += '    </trkseg>\n';
                    gpx += '  </trk>\n';
                }
            });
        }
        
        gpx += '</gpx>';
        return gpx;
    }
}

// Exportar globalmente
window.RoutingPanel = RoutingPanel;