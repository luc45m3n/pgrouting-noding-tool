// static/menu_principal.js

L.Control.MainMenu = L.Control.extend({
    options: { position: 'topright' },

    onAdd: function (map) {
        this._map = map;
        this._baseMaps = [];
        this._overlays = [];
        this._activeBaseMapName = null;

        const container = L.DomUtil.create('div', 'leaflet-main-menu leaflet-bar');
        
        // Header con ícono hamburguesa
        const header = L.DomUtil.create('div', 'main-menu-header', container);
        header.innerHTML = '☰';
        header.title = 'Menú principal';
        header.onclick = () => container.classList.toggle('expanded');

        // Contenedor de contenido
        this._contentContainer = L.DomUtil.create('div', 'main-menu-content', container);

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);

        return container;
    },

    // Añadir Mapa Base
    addBaseMap: function (layer, name) {
        this._baseMaps.push({ layer, name });
        if (this._baseMaps.length === 1) {
            this._activeBaseMapName = name;
            this._map.addLayer(layer);
        }
        this._updateContent();
    },

    // Añadir Capa Superpuesta
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

        // SECCIÓN 2: Formulario de Carga
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
        `;

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

                const btnUp = L.DomUtil.create('button', '', btns);
                btnUp.innerHTML = '⬆️';
                btnUp.title = 'Subir';
                btnUp.onclick = () => this.moveLayer(item.id, 1);

                const btnDown = L.DomUtil.create('button', '', btns);
                btnDown.innerHTML = '⬇️';
                btnDown.title = 'Bajar';
                btnDown.onclick = () => this.moveLayer(item.id, -1);

                const btnRem = L.DomUtil.create('button', '', btns);
                btnRem.innerHTML = '🗑️';
                btnRem.title = 'Eliminar';
                btnRem.className = 'btn-remove';
                btnRem.onclick = () => {
                    this._map.removeLayer(item.layer);
                    this.removeLayer(item.id);
                    if(window.showToast) window.showToast("Capa eliminada", "success", 2000);
                };
            });
        }

        // Inicializar eventos del formulario después de renderizar
        setTimeout(() => this._initFormEvents(), 50);
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

        fileInput.addEventListener('change', function() {
            if (this.files && this.files.length > 0) {
                fileNameDisplay.textContent = this.files[0].name;
                fileNameDisplay.style.color = '#16a34a';
            }
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!fileInput.files.length) {
                if(window.showToast) window.showToast("Selecciona un archivo", "error");
                return;
            }
            
            const file = fileInput.files[0];
            const epsgValue = epsgInput.value ? parseInt(epsgInput.value) : null;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Procesando...';

            const formData = new FormData();
            formData.append('file', file);
            if (epsgValue) formData.append('source_epsg', epsgValue);

            try {
                const response = await fetch('/api/v1/geojson/process', { method: 'POST', body: formData });
                const data = await response.json();

                if (!response.ok) {
                    if (response.status === 400 && data.detail.error === "CRS Desconocido") {
                        if(window.showToast) window.showToast("CRS desconocido. Ingresa EPSG", "warning", 0);
                        epsgGroup.classList.remove('hidden');
                    } else {
                        if(window.showToast) window.showToast(data.detail.message || "Error", "error");
                    }
                    return;
                }

                if(window.showToast) window.showToast(`✅ ${data.data.feature_count} features cargados`, 'success', 3000);
                if (data.warnings?.length) window.showToast(data.warnings.join(" "), 'warning', 6000);
                
                if(window.addLayerToMap) window.addLayerToMap(data.data.geojson_data, file.name);
                
                form.reset();
                fileNameDisplay.textContent = 'Ninguno';
                epsgGroup.classList.add('hidden');

            } catch (err) {
                if(window.showToast) window.showToast(`Error: ${err.message}`, "error", 0);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Cargar';
            }
        });

        cancelBtn.addEventListener('click', () => {
            form.reset();
            epsgGroup.classList.add('hidden');
            fileNameDisplay.textContent = 'Ninguno';
        });
    }
});