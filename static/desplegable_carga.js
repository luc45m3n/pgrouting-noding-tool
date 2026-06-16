// static/desplegable_carga.js

L.Control.FileUpload = L.Control.extend({
    onAdd: function (map) {
        const container = L.DomUtil.create('div', 'leaflet-control-file-upload leaflet-bar');
        
        const header = L.DomUtil.create('div', 'upload-header', container);
        header.innerHTML = '<span class="upload-icon"></span><span class="upload-label">Cargar</span>';
        header.title = 'Cargar archivo GeoJSON';
        
        const body = L.DomUtil.create('div', 'upload-body', container);
        body.innerHTML = `
            <form id="uploadForm">
                <div class="form-group">
                    <!-- CORREGIDO: Agregado 'for="fileInput"' -->
                    <label for="fileInput">Archivo GeoJSON:</label>
                    <div class="custom-file-wrapper">
                        <input type="file" id="fileInput" name="file" accept=".geojson,.json" required hidden>
                        <label for="fileInput" class="btn-custom-file">Seleccionar</label>
                        <span id="fileNameDisplay" class="file-name">Ninguno</span>
                    </div>
                </div>
                <div class="form-group hidden" id="epsgGroup">
                    <!-- CORREGIDO: Agregado 'for="epsgInput"' -->
                    <label for="epsgInput">EPSG Origen (Opcional):</label>
                    <input type="number" id="epsgInput" placeholder="Ej: 4326, 32718">
                </div>
                <div class="upload-actions">
                    <button type="submit" id="submitBtn" class="btn btn-primary">Procesar</button>
                    <button type="button" id="cancelBtn" class="btn btn-secondary">Limpiar</button>
                </div>
            </form>
        `;

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);

        header.addEventListener('click', () => {
            container.classList.toggle('expanded');
        });

        return container;
    }
});