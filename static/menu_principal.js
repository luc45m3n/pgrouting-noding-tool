// static/menu_principal.js

L.Control.MainMenu = L.Control.extend({
    options: { position: 'topright' },

    
onAdd: function (map) {
    this._map = map;
    this._baseMaps = [];
    this._overlays = [];
    this._activeBaseMapName = null;
    this._formTimeout = null;
    this._showNetworkPanel = false;

    const container = L.DomUtil.create('div', 'leaflet-main-menu leaflet-bar');
    
    const header = L.DomUtil.create('div', 'main-menu-header', container);
    header.innerHTML = '&#9776;';
    header.title = i18n.t('menu.title');
    header.onclick = () => container.classList.toggle('expanded');

    // ✅ CORREGIDO: Selector de idioma usando referencia directa
    const langSelector = L.DomUtil.create('div', 'lang-selector', container);
    langSelector.style.cssText = 'padding: 0 8px;';
    
    const select = L.DomUtil.create('select', '', langSelector);
    select.style.cssText = 'width: 100%; padding: 4px; margin: 4px 0; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;';
    
    const optEs = L.DomUtil.create('option', '', select);
    optEs.value = 'es';
    optEs.textContent = 'Español';
    if (i18n.currentLang === 'es') optEs.selected = true;
    
    const optEn = L.DomUtil.create('option', '', select);
    optEn.value = 'en';
    optEn.textContent = 'English';
    if (i18n.currentLang === 'en') optEn.selected = true;
    
    // ✅ Usar referencia directa 'select' en lugar de document.getElementById
    select.addEventListener('change', (e) => {
        i18n.setLanguage(e.target.value);
    });

    this._contentContainer = L.DomUtil.create('div', 'main-menu-content', container);

    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);

    window.addEventListener('languageChanged', () => {
        this._updateContent();
    });

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
            title1.textContent = i18n.t('menu.basemap');

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

        // SECCIÓN 2: Carga GeoJSON (TODO EL HTML EN UN SOLO TEMPLATE LITERAL)
        const section2 = L.DomUtil.create('div', 'menu-section', this._contentContainer);
        const title2 = L.DomUtil.create('div', 'menu-section-title', section2);
        title2.textContent = i18n.t('menu.load');

        section2.innerHTML = `
            <form id="uploadForm" style="padding: 8px;">
                <div class="menu-form-group">
                    <label for="fileInput">${i18n.t('menu.file')}</label>
                    <div class="custom-file-wrapper">
                        <input type="file" id="fileInput" name="file" accept=".geojson,.json" required hidden>
                        <label for="fileInput" class="btn-select-file">${i18n.t('menu.select')}</label>
                        <span id="fileNameDisplay" class="file-name">${i18n.t('menu.none')}</span>
                    </div>
                </div>
                <div class="menu-form-group hidden" id="epsgGroup">
                    <label for="epsgInput">${i18n.t('menu.epsg')}</label>
                    <input type="number" id="epsgInput" placeholder="Ej: 4326">
                </div>
                <div class="menu-actions">
                    <button type="submit" id="submitBtn" class="btn btn-primary">${i18n.t('menu.upload')}</button>
                    <button type="button" id="cancelBtn" class="btn btn-secondary">${i18n.t('menu.clear')}</button>
                </div>
            </form>

            <div id="networkProcessingPanel" style="display: none; margin-top: 10px; padding: 8px; background: #f0f9ff; border-radius: 4px; border-left: 3px solid #3b82f6;">
                <div style="font-size: 0.9em; margin-bottom: 8px;">
                    <strong>${i18n.t('network.hasLines')}</strong><br>
                    <small style="color: #666;">${i18n.t('network.processQuestion')}</small>
                </div>

                <div id="utmOptions" style="display: block;">
                    <div class="menu-form-group">
                        <label for="utmEpsgInput">${i18n.t('network.utmProjection')}</label>
                        <select id="utmEpsgInput" style="width: 100%; padding: 4px;">
                            <option value="">${i18n.t('network.noProjection')}</option>
                            <option value="32719" selected>${i18n.t('network.utm19s')}</option>
                            <option value="32718">${i18n.t('network.utm18s')}</option>
                            <option value="32717">${i18n.t('network.utm17s')}</option>
                            <option value="32720">${i18n.t('network.utm20s')}</option>
                            <option value="32721">${i18n.t('network.utm21s')}</option>
                        </select>
                    </div>

                    <div class="menu-form-group">
                        <label for="toleranceInput">${i18n.t('network.nodeTolerance')}</label>
                        <input type="number" id="toleranceInput" value="0.5" step="0.1" min="0.1" max="10" style="width: 100%; padding: 4px;">
                        <small style="color: #666; font-size: 0.75em;">${i18n.t('network.nodeToleranceHelp')}</small>
                    </div>

                    <!-- ✅ NUEVO: Opciones avanzadas -->
                    <details style="margin-top: 8px; font-size: 0.85em;">
                        <summary style="cursor: pointer; color: #3b82f6; font-weight: 600;">${i18n.t('network.advancedOptions')}</summary>

                        <div class="menu-form-group" style="margin-top: 8px;">
                            <label for="snapToleranceInput">${i18n.t('network.snapTolerance')}</label>
                            <input type="number" id="snapToleranceInput" value="0" step="0.1" min="0" max="5" style="width: 100%; padding: 4px;">
                            <small style="color: #666; font-size: 0.75em;">${i18n.t('network.snapHelp')} </small>
                        </div>

                        <div class="menu-form-group">
                            <label for="simplifyToleranceInput">${i18n.t('network.simplifyTolerance')}</label>
                            <input type="number" id="simplifyToleranceInput" value="0" step="0.1" min="0" max="5" style="width: 100%; padding: 4px;">
                            <small style="color: #666; font-size: 0.75em;">${i18n.t('network.simplifyHelp')}</small>
                        </div>
                        
                    </details>
                </div>

                <button type="button" id="processNetworkBtn" class="btn btn-primary" style="width: 100%; margin-top: 8px;">
                    ${i18n.t('network.processNetwork')}
                </button>
            </div>

            <div id="networksListContainer" style="margin-top: 10px; max-height: 200px; overflow-y: auto; border-top: 1px solid #eee; padding-top: 8px;">
                <em style="color: #888; font-size: 0.85em;">${i18n.t('menu.noNetworks')}</em>
            </div>

            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #eee;">
                <button type="button" id="toggleRoutingPanel" class="btn btn-primary" style="width: 100%;">
                    ${i18n.t('menu.routing')}
                </button>
            </div>
        `;

        // Restaurar estado del panel
        if (this._showNetworkPanel) {
            const panel = document.getElementById('networkProcessingPanel');
            if (panel) panel.style.display = 'block';
        }

        // SECCIÓN 3: Capas Cargadas
        if (this._overlays.length > 0) {
            const section3 = L.DomUtil.create('div', 'menu-section', this._contentContainer);
            const title3 = L.DomUtil.create('div', 'menu-section-title', section3);
            title3.textContent =  i18n.t('menu.layers');

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
                        if(window.showToast) window.showToast("No se puede hacer zoom", "warning", 3000);
                    }
                };

                const btnUp = L.DomUtil.create('button', '', btns);
                btnUp.innerHTML = '⬆️';
                btnUp.title = 'Subir';
                btnUp.onclick = (e) => { L.DomEvent.stopPropagation(e); this.moveLayer(item.id, 1); };

                const btnDown = L.DomUtil.create('button', '', btns);
                btnDown.innerHTML = '⬇️';
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

        fileInput.onchange = function() {
            if (this.files && this.files.length > 0) {
                fileNameDisplay.textContent = this.files[0].name;
                fileNameDisplay.style.color = '#16a34a';
            }
        };

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
                    if (response.status === 400 && data.detail && data.detail.error === "CRS Desconocido") {
                        if(window.showToast) window.showToast("CRS desconocido. Ingresa EPSG", "warning", 0);
                        epsgGroup.classList.remove('hidden');
                    } else {
                        const errorMsg = (data.detail && data.detail.message) || data.detail || "Error desconocido";
                        if(window.showToast) window.showToast(errorMsg, "error");
                    }
                    return;
                }
            
                const hasLines = data.data.has_lines;

                if (hasLines) {
                    if(window.showToast) {
                        window.showToast(data.data.feature_count + " features cargadas (tiene líneas)", 'success', 3000);
                    }
                    window.lastLoadedGeoJSON = data.data.geojson_data;
                    this._showNetworkPanel = true;
                    const panel = document.getElementById('networkProcessingPanel');
                    if (panel) panel.style.display = 'block';
                } else {
                    if(window.showToast) {
                        window.showToast(data.data.feature_count + " features cargadas", 'success', 3000);
                    }
                    this._showNetworkPanel = false;
                    const panel = document.getElementById('networkProcessingPanel');
                    if (panel) panel.style.display = 'none';
                }

                if (data.warnings && data.warnings.length) window.showToast(data.warnings.join(" "), 'warning', 6000);

                if(window.addLayerToMap) window.addLayerToMap(data.data.geojson_data, file.name);

                form.reset();
                fileNameDisplay.textContent = 'Ninguno';
                fileNameDisplay.style.color = '#666';
                epsgGroup.classList.add('hidden');
            
            } catch (err) {
                if(window.showToast) window.showToast("Error: " + err.message, "error", 0);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Cargar';
            }
        };

        cancelBtn.onclick = () => {
            form.reset();
            epsgGroup.classList.add('hidden');
            fileNameDisplay.textContent = 'Ninguno';
            fileNameDisplay.style.color = '#666';
            this._showNetworkPanel = false;
            const panel = document.getElementById('networkProcessingPanel');
            if (panel) panel.style.display = 'none';
        };

        // Toggle del checkbox UTM
        const processAsNetworkCheckbox = document.getElementById('processAsNetworkCheckbox');
        const utmOptions = document.getElementById('utmOptions');

        if (processAsNetworkCheckbox && utmOptions) {
            processAsNetworkCheckbox.onchange = function() {
                utmOptions.style.display = this.checked ? 'block' : 'none';
            };
        }

        // Procesar red
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
                        window.showToast("Archivo cargado solo para visualización", "success", 3000);
                    }
                    this._showNetworkPanel = false;
                    const panel = document.getElementById('networkProcessingPanel');
                    if (panel) panel.style.display = 'none';
                    return;
                }
                
                // ✅ NUEVO: Obtener todos los parámetros de configuración
                const utmEpsgValue = document.getElementById('utmEpsgInput').value;
                const utmEpsg = utmEpsgValue ? parseInt(utmEpsgValue) : 4326;
                const tolerance = parseFloat(document.getElementById('toleranceInput').value) || 0.5;
                const snapTolerance = parseFloat(document.getElementById('snapToleranceInput').value) || 0;
                const simplifyTolerance = parseFloat(document.getElementById('simplifyToleranceInput').value) || 0;

                processNetworkBtn.disabled = true;
                processNetworkBtn.textContent = 'Procesando...';
            
                try {
                    // ✅ NUEVO: Enviar todos los parámetros al backend
                    const response = await fetch('/api/networks/process', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            geojson: window.lastLoadedGeoJSON,
                            target_epsg: utmEpsg,
                            tolerance: tolerance,
                            snap_tolerance: snapTolerance,
                            simplify_tolerance: simplifyTolerance
                        })
                    });
                
                    const contentType = response.headers.get('content-type');
                    if (!contentType || !contentType.includes('application/json')) {
                        const text = await response.text();
                        console.error('Respuesta no es JSON:', text.substring(0, 200));
                        throw new Error('El servidor no devolvió JSON válido');
                    }
                    
                    const data = await response.json();
                    
                    if (!data) {
                        throw new Error('La respuesta del servidor está vacía');
                    }
                
                    if (!response.ok) {
                        throw new Error(data.detail || data.message || 'Error al procesar la red');
                    }
                    
                    if (!data.table_name) {
                        console.error('Falta table_name en la respuesta:', data);
                        throw new Error('La respuesta no contiene table_name');
                    }
                
                    // Eliminar capa original
                    if (window.lastLoadedLayer) {
                        if (window.mapInstance) {
                            try { window.mapInstance.removeLayer(window.lastLoadedLayer.layer); } catch(e) {}
                        }
                        if (window.mainMenu) {
                            window.mainMenu.removeLayer(window.lastLoadedLayer.layerId);
                        }
                        window.lastLoadedLayer = null;
                        console.log(i18n.t("log.original_layer_removed"));
                    }
                
                    if(window.setActiveNetwork) {
                        window.setActiveNetwork(data.table_name);
                    }
                
                    this._showNetworkPanel = false;
                    const panel = document.getElementById('networkProcessingPanel');
                    if (panel) panel.style.display = 'none';
                    
                    this._loadNetworksList();
                    
                    if(window.showToast) {
                        const edges = data.edges || '?';
                        const vertices = data.vertices || '?';
                        window.showToast(i18n.t("log.network_created", edges=edges, vertices=vertices), i18n.t("log.success"), 5000);
                    }
                
                } catch (err) {
                    console.error('Error en processNetworkBtn:', err);
                    if(window.showToast) window.showToast(i18n.t("log.processing_network_error", error=err.message), i18n.t("log.error"), 5000);
                } finally {
                    processNetworkBtn.disabled = false;
                    processNetworkBtn.textContent = i18n.t("log.process_as_network");
                }
                // ✅ Toggle del panel de ruteo (AGREGAR ACÁ)
                const toggleRoutingBtn = document.getElementById('toggleRoutingPanel');
                if (toggleRoutingBtn && window.routingPanel) {
                    toggleRoutingBtn.onclick = () => {
                        window.routingPanel.toggle();
                    };
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
                container.innerHTML = '<em style="color: #888; font-size: 0.85em;">' + i18n.t("log.no_networks_loaded") + '</em>';
                return;
            }

            const activeNetwork = window.activeNetwork || null;

            let html = '<strong style="font-size: 0.85em; color: #333;">' + i18n.t('menu.networks') + '</strong>';
            data.networks.forEach(net => {
                const isActive = net.table_name === activeNetwork;
                html += '<div class="network-item ' + (isActive ? 'active' : '') + '" style="padding: 6px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; font-size: 0.85em;">';
                html += '<div style="flex: 1; cursor: pointer;" onclick="window.setActiveNetwork(\'' + net.table_name + '\')">';
                html += '<strong style="color: ' + (isActive ? '#16a34a' : '#333') + ';">';
                html += (isActive ? '✓ ' : '') + net.table_name;
                html += '</strong><br>';
                html += '<small style="color: #666;">' + net.edges + ' aristas · ' + net.vertices + ' vértices</small>';
                html += '</div>';
                html += '<button onclick="window.deleteNetwork(\'' + net.table_name + '\')" style="background: #dc3545; color: white; border: none; padding: 3px 8px; border-radius: 3px; cursor: pointer; font-size: 0.8em; margin-left: 5px;" title="Eliminar red">X</button>';
                html += '</div>';
            });
            container.innerHTML = html;

        } catch (err) {
            container.innerHTML = '<em style="color: #dc3545; font-size: 0.85em;">' + i18n.t("log.loading_networks_error") + '</em>';
            console.error(i18n.t("log.loading_networks_error"), err);
        }
    }
});