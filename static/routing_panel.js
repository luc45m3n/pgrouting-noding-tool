// static/routing_panel.js
// Panel flotante arrastrable para ruteo con Dijkstra y TSP

class RoutingPanel {
    constructor(map) {
        this.map = map;
        this.algorithm = 'dijkstra';
        this.waypoints = [];
        this.routeLayer = null;
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.isVisible = false; // ✅ NUEVO: trackear visibilidad
        
        this.createPanel();
        this.setupDrag();
        this.setupMapClicks();
    }
    
    createPanel() {
        this.panel = document.createElement('div');
        this.panel.className = 'routing-panel';
        // ✅ Panel inicia OCULTO
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
            return index === 0 ? ' Origen' : '🔴 Destino';
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
        
        // ✅ Agregar event listeners a los botones de eliminar
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
    
    clearRoute() {
        if (this.routeLayer) {
            this.map.removeLayer(this.routeLayer);
            this.routeLayer = null;
        }
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
    
    async calculateDijkstra() {
        const startNode = this.waypoints[0].nodeId;
        const endNode = this.waypoints[1].nodeId;
        
        const result = await window.calculateShortestPath(startNode, endNode);
        
        const geomObject = typeof result.geom === 'string' ? JSON.parse(result.geom) : result.geom;
        
        this.routeLayer = L.geoJSON(geomObject, {
            style: {
                color: '#667eea',
                weight: 5,
                opacity: 0.8,
                lineCap: 'round',
                lineJoin: 'round'
            }
        }).addTo(this.map);
        
        if (this.routeLayer.getBounds().isValid()) {
            this.map.fitBounds(this.routeLayer.getBounds(), { padding: [50, 50] });
        }
        
        if (window.showToast) {
            window.showToast('✅ Ruta calculada correctamente', 'success', 3000);
        }
    }
    
    async calculateTSP() {
        const nodeIds = this.waypoints.map(wp => wp.nodeId);
        
        const result = await window.calculateTSP(nodeIds, nodeIds[0]);
        
        this.routeLayer = L.geoJSON(result.geojson, {
            style: {
                color: '#667eea',
                weight: 5,
                opacity: 0.8,
                lineCap: 'round',
                lineJoin: 'round',
                dashArray: '10, 5'
            }
        }).addTo(this.map);
        
        if (this.routeLayer.getBounds().isValid()) {
            this.map.fitBounds(this.routeLayer.getBounds(), { padding: [50, 50] });
        }
        
        if (window.showToast) {
            window.showToast(`✅ TSP calculado: ${result.tsp_order.length} puntos`, 'success', 3000);
        }
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
    
    // ✅ MÉTODOS DE VISIBILIDAD CORREGIDOS
    show() {
        this.panel.style.display = 'block';
        this.isVisible = true;
        this.updateNetworkStatus();
        
        // Actualizar botón del menú
        const toggleBtn = document.getElementById('toggleRoutingPanel');
        if (toggleBtn) toggleBtn.textContent = 'Ocultar panel de ruteo';
    }
    
    hide() {
        this.panel.style.display = 'none';
        this.isVisible = false;
        
        // Actualizar botón del menú
        const toggleBtn = document.getElementById('toggleRoutingPanel');
        if (toggleBtn) toggleBtn.textContent = 'Abrir panel de ruteo';
    }
    
    // ✅ NUEVO: método toggle
    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }
}

// Exportar globalmente
window.RoutingPanel = RoutingPanel;