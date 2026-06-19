// static/menu_principal.js

L.Control.MainMenu = L.Control.extend({
    options: { position: 'topright' },

    onAdd: function (map) {
        this._map = map;
        this._baseMaps = [];
        this._overlays = [];
        this._activeBaseMapName = null;
        this._formTimeout = null;
        this._showNetworkPanel = false; // ✅ NUEVO: recordar estado del panel

        const container = L.DomUtil.create('div', 'leaflet-main-menu leaflet-bar');
        
        const header = L.DomUtil.create('div', 'main-menu-header', container);
        header.innerHTML = '☰';
        header.title = 'Menú principal';
        header.onclick = () => container.classList.toggle('expanded');

        this._contentContainer = L.DomUtil.create('div', 'main-menu-content', container);

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);

        return container;
    },

    addBaseMap: function (layer, name) {
        this._baseMaps.push({ layer, name });
        if (this._baseMaps.length === 1) {
            this._activeBaseMapName = name;
            this._map.addLayer(layer);
        }
        this._updateContent();
    },

    addLayer: function (layer, name) {
        const id = layer._leaflet_id;
        if (!this._overlays.find(l => l.id === id)) {
            this._overlays.push({ layer, name, id });
            this._updateContent();
        }
    },

    removeLayer: function (layerId) {
        this._overlays = this._overlays.filter(l => l.id !== layerId);
        this._updateContent();
    },

    moveLayer: function (layerId, direction) {
        const index = this._overlays.findIndex(l => l.id === layerId);
        if (index === -1) return;
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= this._overlays.length) return;

        const temp = this._overlays[index];
        this._overlays[index] = this._overlays[newIndex];
        this._overlays[newIndex] = temp;

        this._applyOrderToMap();
        this._updateContent();
    },

    _applyOrderToMap: function () {
        this._baseMaps.forEach(bm => {
            if (this._map.hasLayer(bm.layer)) bm.layer.bringToBack();
        });
        this._overlays.forEach(item => {
            if (this._map.hasLayer(item.layer)) item.layer.bringToFront();
        });
    },

    _updateContent: function () {
        this._contentContainer.innerHTML = '';
        
        // SECCIÓN 1: Mapas Base
        if (this._baseMaps.length > 0) {
            const section1 = L.DomUtil.create('div', 'menu-section', this._contentContainer);
            const title1 = L.DomUtil.create('div', 'menu-section-title', section1);
            title1.textContent = 'Mapa Base';
            
            this._baseMaps.forEach((item) => {
                const row = L.DomUtil.create('div', 'menu-row', section1);
                const radio = L.DomUtil.create('input', 'menu-radio', row);
                radio.type = 'radio';
                radio.name = 'basemap-group';
                radio.checked = (this._activeBaseMapName === item.name);
                
                radio.onchange = () => {
                    this._baseMaps.forEach(bm => this._map.removeLayer(bm.layer));
                    this._map.addLayer(item.layer);
                    item.layer.bringToBack();
                    this._activeBaseMapName = item.name;
                    this._updateContent();
                };
                
                const label = L.DomUtil.create('span', 'menu-label', row);
                label.textContent = item.name;
            });
        }

        // SECCIÓN 2: Carga GeoJSON
        const section2 = L.DomUtil.create('div', 'menu-section', this._contentContainer);
        const title2 = L.DomUtil.create('div', 'menu-section-title', section2);
        title2.textContent = 'Cargar GeoJSON';

        section2.innerHTML += `
            <form id="uploadForm" style="padding: 8px;">
                <div class="menu-form-group">
                    <label for="fileInput">Archivo:</label>
                    <div class="custom-file-wrapper">
                        <input type="file" id="fileInput" name="file" accept=".geojson,.json" required hidden>
                        <label for="fileInput" class="btn-select-file">Seleccionar</label>
                        <span id="fileNameDisplay" class="file-name">Ninguno</span>
                    </div>
                </div>
                <div class="menu-form-group hidden" id="epsgGroup">
                    <label for="epsgInput">EPSG Origen:</label>
                    <input type="number" id="epsgInput" placeholder="Ej: 4326">
                </div>
                <div class="menu-actions">
                    <button type="submit" id="submitBtn" class="btn btn-primary">Cargar</button>
                    <button type="button" id="cancelBtn" class="btn btn-secondary">Limpiar</button>
                </div>
            </form>

            <!-- Panel de procesamiento de red (oculto inicialmente) -->
            <div id="networkProcessingPanel" style="display: none; margin-top: 10px; padding: 8px; background: #f0f9ff; border-radius: 4px; border-left: 3px solid #3b82f6;">
                <div style="font-size: 0.9em; margin-bottom: 8px;">
                    <strong>🛣️ Este archivo tiene líneas</strong><br>
                    <small style="color: #666;">¿Querés procesarlo como red ruteable?</small>
                </div>
                
                <div class="menu-form-group">
                    <label style="display: flex; align-items: center; gap: 6px; font-size: 0.9em;">
                        <input type="checkbox" id="processAsNetworkCheckbox" checked>
                        <span>Sí, procesar como red</span>
                    </label>
                </div>
                
                <div id="utmOptions" style="display: block;">
                    <div class="menu-form-group">
                        <label for="utmEpsgInput">Proyección UTM destino:</label>
                        <select id="utmEpsgInput" style="width: 100%; padding: 4px;">
                            <option value="">Sin proyección (WGS84 / EPSG:4326)</option>
                            <option value="32719" selected>32719 - UTM 19S (Bariloche/Patagonia)</option>
                            <option value="32718">32718 - UTM 18S (Buenos Aires/Centro)</option>
                            <option value="32717">32717 - UTM 17S (Norte)</option>
                            <option value="32720">32720 - UTM 20S (Chubut/Santa Cruz)</option>
                            <option value="32721">32721 - UTM 21S (Tierra del Fuego)</option>
                        </select>
                        <small style="color: #666; font-size: 0.75em;">Dejá en blanco para usar WGS84</small>
                    </div>
                </div>
                
                <button type="button" id="processNetworkBtn" class="btn btn-primary" style="width: 100%; margin-top: 8px;">
                    ⚙️ Procesar
                </button>
            </div>

            <div id="networksListContainer" style="margin-top: 10px; max-height: 200px; overflow-y: auto; border-top: 1px solid #eee; padding-top: 8px;">
                <em style="color: #888; font-size: 0.85em;">No hay redes cargadas</em>
            </div>
        `;

        // ✅ NUEVO: Restaurar estado del panel después de recrear el HTML
        if (this._showNetworkPanel) {
            const panel = document.getElementById('networkProcessingPanel');
            if (panel) panel.style.display = 'block';
        }

        // SECCIÓN 3: Capas Cargadas
        if (this._overlays.length > 0) {
            const section3 = L.DomUtil.create('div', 'menu-section', this._contentContainer);
            const title3 = L.DomUtil.create('div', 'menu-section-title', section3);
            title3.textContent = 'Capas Cargadas';

            this._overlays.forEach((item) => {
                const row = L.DomUtil.create('div', 'menu-row', section3);

                const checkbox = L.DomUtil.create('input', 'menu-checkbox', row);
                checkbox.type = 'checkbox';
                checkbox.checked = this._map.hasLayer(item.layer);
                checkbox.onchange = (e) => {
                    if (e.target.checked) {
                        this._map.addLayer(item.layer);
                        item.layer.bringToFront();
                    } else {
                        this._map.removeLayer(item.layer);
                    }
                };

                const label = L.DomUtil.create('span', 'menu-label', row);
                label.textContent = item.name;

                const btns = L.DomUtil.create('div', 'menu-btns', row);
                
                const btnZoom = L.DomUtil.create('button', '', btns);
                btnZoom.innerHTML = '🔍';
                btnZoom.title = 'Zoom a la extensión de la capa';
                btnZoom.className = 'btn-zoom';
                btnZoom.onclick = (e) => {
                    L.DomEvent.stopPropagation(e);
                    if (item.layer.getBounds && item.layer.getBounds().isValid()) {
                        this._map.fitBounds(item.layer.getBounds(), { padding: [30, 30] });
                    } else {
                        if(window.showToast) window.showToast("No se puede hacer zoom (geometría inválida)", "warning", 3000);
                    }
                };
                
                const btnUp = L.DomUtil.create('button', '', btns);
                btnUp.innerHTML = '&#8593';
                btnUp.title = 'Subir';
                btnUp.onclick = (e) => { L.DomEvent.stopPropagation(e); this.moveLayer(item.id, 1); };

                const btnDown = L.DomUtil.create('button', '', btns);
                btnDown.innerHTML = '️&#8595';
                btnDown.title = 'Bajar';
                btnDown.onclick = (e) => { L.DomEvent.stopPropagation(e); this.moveLayer(item.id, -1); };

                const btnRem = L.DomUtil.create('button', '', btns);
                btnRem.innerHTML = '🗑️';
                btnRem.title = 'Eliminar';
                btnRem.className = 'btn-remove';
                btnRem.onclick = (e) => { 
                    L.DomEvent.stopPropagation(e);
                    this._map.removeLayer(item.layer); 
                    this.removeLayer(item.id); 
                    if(window.showToast) window.showToast("Capa eliminada", "success", 2000); 
                };
            });
        }

        // Inicializar eventos
        if (this._formTimeout) clearTimeout(this._formTimeout);
        this._formTimeout = setTimeout(() => {
            this._initFormEvents();
            this._loadNetworksList();
        }, 50);
    },

    _initFormEvents: function () {
        const form = document.getElementById('uploadForm');
        const fileInput = document.getElementById('fileInput');
        const fileNameDisplay = document.getElementById('fileNameDisplay');
        const epsgGroup = document.getElementById('epsgGroup');
        const epsgInput = document.getElementById('epsgInput');
        const submitBtn = document.getElementById('submitBtn');
        const cancelBtn = document.getElementById('cancelBtn');

        if (!form || !fileInput) return;

        // Evento: seleccionar archivo
        fileInput.onchange = function() {
            if (this.files && this.files.length > 0) {
                fileNameDisplay.textContent = this.files[0].name;
                fileNameDisplay.style.color = '#16a34a';
            }
        };

        // Evento: cargar GeoJSON (solo visualización)
        form.onsubmit = async (e) => {
            e.preventDefault();
            if (!fileInput.files.length) {
                if(window.showToast) window.showToast("Selecciona un archivo", "error");
                return;
            }

            const file = fileInput.files[0];
            const epsgValue = epsgInput.value ? parseInt(epsgInput.value) : null;

            submitBtn.disabled = true;
            submitBtn.textContent = 'Cargando...';
        
            const formData = new FormData();
            formData.append('file', file);
            if (epsgValue) formData.append('source_epsg', epsgValue);
        
            try {
                const response = await fetch('/api/v1/geojson/process', { method: 'POST', body: formData });
                const data = await response.json();
            
                if (!response.ok) {
                    if (response.status === 400 && data.detail?.error === "CRS Desconocido") {
                        if(window.showToast) window.showToast("CRS desconocido. Ingresa EPSG", "warning", 0);
                        epsgGroup.classList.remove('hidden');
                    } else {
                        const errorMsg = data.detail?.message || data.detail || "Error desconocido";
                        if(window.showToast) window.showToast(errorMsg, "error");
                    }
                    return;
                }
                
                    const hasLines = data.data.has_lines;

                    if (hasLines) {
                        if(window.showToast) {
                            window.showToast(`✅ ${data.data.feature_count} features cargadas (tiene líneas)`, 'success', 3000);
                        }
                        window.lastLoadedGeoJSON = data.data.geojson_data;
                        this._showNetworkPanel = true; // ✅ NUEVO: recordar que debe mostrarse
                        const panel = document.getElementById('networkProcessingPanel');
                        if (panel) panel.style.display = 'block';
                    } else {
                        if(window.showToast) {
                            window.showToast(`✅ ${data.data.feature_count} features cargadas`, 'success', 3000);
                        }
                        this._showNetworkPanel = false; // ✅ NUEVO: ocultar
                        const panel = document.getElementById('networkProcessingPanel');
                        if (panel) panel.style.display = 'none';
                    }

                    if (data.warnings?.length) window.showToast(data.warnings.join(" "), 'warning', 6000);

                    if(window.addLayerToMap) window.addLayerToMap(data.data.geojson_data, file.name);

                    form.reset();
                    fileNameDisplay.textContent = 'Ninguno';
                    fileNameDisplay.style.color = '#666';
                    epsgGroup.classList.add('hidden');
                
                } catch (err) {
                    if(window.showToast) window.showToast(`Error: ${err.message}`, "error", 0);
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Cargar';
                }
            };

            // Evento: limpiar formulario
            cancelBtn.onclick = () => {
                form.reset();
                epsgGroup.classList.add('hidden');
                fileNameDisplay.textContent = 'Ninguno';
                fileNameDisplay.style.color = '#666';
                this._showNetworkPanel = false; // ✅ NUEVO: ocultar
                const panel = document.getElementById('networkProcessingPanel');
                if (panel) panel.style.display = 'none';
            };

            // Toggle del checkbox para mostrar/ocultar opciones UTM
            const processAsNetworkCheckbox = document.getElementById('processAsNetworkCheckbox');
            const utmOptions = document.getElementById('utmOptions');

            if (processAsNetworkCheckbox && utmOptions) {
                processAsNetworkCheckbox.onchange = function() {
                    utmOptions.style.display = this.checked ? 'block' : 'none';
                };
            }

            // Evento: procesar como red ruteable
            const processNetworkBtn = document.getElementById('processNetworkBtn');
            if (processNetworkBtn) {
                processNetworkBtn.onclick = async () => {
                    if (!window.lastLoadedGeoJSON) {
                        if(window.showToast) window.showToast("No hay GeoJSON cargado", "error");
                        return;
                    }
                
                    const shouldProcess = processAsNetworkCheckbox ? processAsNetworkCheckbox.checked : true;
                    
                    if (!shouldProcess) {
                        if(window.showToast) {
                            window.showToast("✅ Archivo cargado solo para visualización", "success", 3000);
                        }
                        this._showNetworkPanel = false;
                        const panel = document.getElementById('networkProcessingPanel');
                        if (panel) panel.style.display = 'none';
                        return;
                    }
                    
                    const utmEpsgValue = document.getElementById('utmEpsgInput').value;
                    const utmEpsg = utmEpsgValue ? parseInt(utmEpsgValue) : 4326;
                
                    processNetworkBtn.disabled = true;
                    processNetworkBtn.textContent = '⏳ Procesando...';
                
                    try {
                        console.log('🔄 Enviando solicitud de procesamiento...');
                        
                        const response = await fetch('/api/networks/process', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                geojson: window.lastLoadedGeoJSON,
                                target_epsg: utmEpsg,
                                tolerance: 0.5
                            })
                        });
                        
                        console.log('📡 Status:', response.status);
                        
                        // ✅ VALIDAR QUE LA RESPUESTA SEA JSON VÁLIDO
                        const contentType = response.headers.get('content-type');
                        if (!contentType || !contentType.includes('application/json')) {
                            const text = await response.text();
                            console.error('❌ Respuesta no es JSON:', text.substring(0, 200));
                            throw new Error('El servidor no devolvió JSON válido');
                        }
                        
                        const data = await response.json();
                        console.log('📦 Datos recibidos:', data);
                        
                        // ✅ VALIDAR QUE DATA NO SEA NULL
                        if (!data) {
                            console.error('❌ data es null');
                            throw new Error('La respuesta del servidor está vacía');
                        }
                    
                        if (!response.ok) {
                            throw new Error(data.detail || data.message || 'Error al procesar la red');
                        }
                        
                        // ✅ VALIDAR ESTRUCTURA DE LA RESPUESTA
                        if (!data.table_name) {
                            console.error('❌ Falta table_name en la respuesta:', data);
                            throw new Error('La respuesta no contiene table_name');
                        }
                    
                        // ✅ ELIMINAR CAPA ORIGINAL AUTOMÁTICAMENTE
                        if (window.lastLoadedLayer) {
                            if (window.mapInstance) {
                                try { window.mapInstance.removeLayer(window.lastLoadedLayer.layer); } catch(e) {}
                            }
                            if (window.mainMenu) {
                                window.mainMenu.removeLayer(window.lastLoadedLayer.layerId);
                            }
                            window.lastLoadedLayer = null;
                            console.log('️ Capa original eliminada automáticamente');
                        }
                    
                        // ✅ ACTIVAR RED PROCESADA
                        if(window.setActiveNetwork) {
                            window.setActiveNetwork(data.table_name);
                        }
                    
                        // Ocultar panel y actualizar lista
                        this._showNetworkPanel = false;
                        const panel = document.getElementById('networkProcessingPanel');
                        if (panel) panel.style.display = 'none';
                        
                        this._loadNetworksList();
                        
                        if(window.showToast) {
                            const edges = data.edges || '?';
                            const vertices = data.vertices || '?';
                            window.showToast(`✅ Red creada: ${edges} aristas, ${vertices} vértices`, 'success', 5000);
                        }
                    
                    } catch (err) {
                        console.error('❌ Error en processNetworkBtn:', err);
                        if(window.showToast) window.showToast(`❌ Error: ${err.message}`, "error", 5000);
                    } finally {
                        processNetworkBtn.disabled = false;
                        processNetworkBtn.textContent = '⚙️ Procesar';
            }
        };
        }
    },

    _loadNetworksList: async function () {
        const container = document.getElementById('networksListContainer');
        if (!container) return;

        try {
            const response = await fetch('/api/networks');
            const data = await response.json();

            if (!data.networks || data.networks.length === 0) {
                container.innerHTML = '<em style="color: #888; font-size: 0.85em;">No hay redes cargadas</em>';
                return;
            }

            const activeNetwork = window.activeNetwork || null;

            container.innerHTML = '<strong style="font-size: 0.85em; color: #333;">Redes disponibles:</strong>' + 
                data.networks.map(net => `
                    <div class="network-item ${net.table_name === activeNetwork ? 'active' : ''}" 
                         style="padding: 6px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; font-size: 0.85em;">
                        <div style="flex: 1; cursor: pointer;" onclick="window.setActiveNetwork('${net.table_name}')">
                            <strong style="color: ${net.table_name === activeNetwork ? '#16a34a' : '#333'};">
                                ${net.table_name === activeNetwork ? '✓ ' : ''}${net.table_name}
                            </strong>
                            <br>
                            <small style="color: #666;">${net.edges} aristas · ${net.vertices} vértices</small>
                        </div>
                        <button onclick="window.deleteNetwork('${net.table_name}')" 
                                style="background: #dc3545; color: white; border: none; padding: 3px 8px; border-radius: 3px; cursor: pointer; font-size: 0.8em; margin-left: 5px;"
                                title="Eliminar red">
                            🗑️
                        </button>
                    </div>
                `).join('');

        } catch (err) {
            container.innerHTML = '<em style="color: #dc3545; font-size: 0.85em;">Error cargando redes</em>';
            console.error('Error cargando redes:', err);
        }
    }
});