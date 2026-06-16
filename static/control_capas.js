// static/control_capas.js

L.Control.LayerManager = L.Control.extend({
    options: { position: 'topright' },

    onAdd: function (map) {
        this._map = map;
        this._baseMaps = []; // Mapas base (Radio buttons)
        this._overlays = []; // Capas superpuestas (Checkboxes)
        this._activeBaseMapName = null;

        const container = L.DomUtil.create('div', 'leaflet-control-layer-manager leaflet-bar');
        
        const header = L.DomUtil.create('div', 'layer-manager-header', container);
        header.innerHTML = '🗂️ Capas';
        header.title = 'Gestionar capas';
        header.onclick = () => container.classList.toggle('expanded');

        this._listContainer = L.DomUtil.create('div', 'layer-manager-list', container);

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);

        return container;
    },

    // Añadir Mapa Base (Radio Button)
    addBaseMap: function (layer, name) {
        this._baseMaps.push({ layer, name });
        // Activar el primero por defecto
        if (this._baseMaps.length === 1) {
            this._activeBaseMapName = name;
            this._map.addLayer(layer);
        }
        this._updateList();
    },

    // Añadir Capa Superpuesta (Checkbox)
    addLayer: function (layer, name) {
        const id = layer._leaflet_id;
        if (!this._overlays.find(l => l.id === id)) {
            this._overlays.push({ layer, name, id });
            this._updateList();
        }
    },

    removeLayer: function (layerId) {
        this._overlays = this._overlays.filter(l => l.id !== layerId);
        this._updateList();
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
        this._updateList();
    },

    _applyOrderToMap: function () {
        // Asegurar que el mapa base siempre esté al fondo
        this._baseMaps.forEach(bm => {
            if (this._map.hasLayer(bm.layer)) bm.layer.bringToBack();
        });
        // Aplicar orden a las superposiciones
        this._overlays.forEach(item => {
            if (this._map.hasLayer(item.layer)) item.layer.bringToFront();
        });
    },

    _updateList: function () {
        this._listContainer.innerHTML = '';
        
        if (this._baseMaps.length === 0 && this._overlays.length === 0) {
            this._listContainer.innerHTML = '<div style="padding: 8px; color: #888; font-size: 0.8em;">Sin capas</div>';
            return;
        }

        // 1. Renderizar Mapas Base (Radio Buttons)
        if (this._baseMaps.length > 0) {
            const baseMapTitle = L.DomUtil.create('div', 'layer-section-title', this._listContainer);
            baseMapTitle.textContent = 'Mapas Base';
            
            this._baseMaps.forEach((item) => {
                const row = L.DomUtil.create('div', 'layer-manager-row', this._listContainer);
                const radio = L.DomUtil.create('input', 'layer-radio', row);
                radio.type = 'radio';
                radio.name = 'basemap-group'; // Mismo nombre para que sean excluyentes
                radio.checked = (this._activeBaseMapName === item.name);
                
                radio.onchange = () => {
                    // Quitar todos los mapas base
                    this._baseMaps.forEach(bm => this._map.removeLayer(bm.layer));
                    // Añadir el seleccionado
                    this._map.addLayer(item.layer);
                    item.layer.bringToBack();
                    this._activeBaseMapName = item.name;
                    this._updateList();
                };
                
                const label = L.DomUtil.create('span', 'layer-name', row);
                label.textContent = item.name;
            });
            
            // Separador visual si hay capas superpuestas
            if (this._overlays.length > 0) {
                L.DomUtil.create('div', 'layer-separator', this._listContainer);
            }
        }

        // 2. Renderizar Capas Superpuestas (Checkboxes + Botones)
        if (this._overlays.length > 0) {
            const overlayTitle = L.DomUtil.create('div', 'layer-section-title', this._listContainer);
            overlayTitle.textContent = 'Capas Cargadas';

            this._overlays.forEach((item) => {
                const row = L.DomUtil.create('div', 'layer-manager-row', this._listContainer);

                const checkbox = L.DomUtil.create('input', 'layer-checkbox', row);
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

                const label = L.DomUtil.create('span', 'layer-name', row);
                label.textContent = item.name;

                const btns = L.DomUtil.create('div', 'layer-btns', row);

                const btnUp = L.DomUtil.create('button', '', btns);
                btnUp.innerHTML = '️';
                btnUp.title = 'Subir capa';
                btnUp.onclick = () => this.moveLayer(item.id, 1);

                const btnDown = L.DomUtil.create('button', '', btns);
                btnDown.innerHTML = '️';
                btnDown.title = 'Bajar capa';
                btnDown.onclick = () => this.moveLayer(item.id, -1);

                const btnRem = L.DomUtil.create('button', '', btns);
                btnRem.innerHTML = '🗑️';
                btnRem.title = 'Eliminar capa';
                btnRem.className = 'btn-remove';
                btnRem.onclick = () => {
                    this._map.removeLayer(item.layer);
                    this.removeLayer(item.id);
                    if(window.showToast) window.showToast("Capa eliminada", "success", 2000);
                };
            });
        }
    }
});