// Variable global para manejar la instancia del mapa
let mapInstance = null;
let geojsonLayer = null;

const form = document.getElementById('uploadForm');
const fileInput = document.getElementById('fileInput');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const epsgGroup = document.getElementById('epsgGroup');
const epsgInput = document.getElementById('epsgInput');
const submitBtn = document.getElementById('submitBtn');
const cancelBtn = document.getElementById('cancelBtn');

const successArea = document.getElementById('successArea');
const warningArea = document.getElementById('warningArea');
const errorArea = document.getElementById('errorArea');

// Estado para recordar el archivo si hay que reintentar con EPSG
let currentFile = null;



// Escuchar cuando el usuario selecciona un archivo
fileInput.addEventListener('change', function() {
    if (this.files && this.files.length > 0) {
        fileNameDisplay.textContent = this.files[0].name;
        fileNameDisplay.style.color = '#16a34a'; // Cambia a verde para indicar éxito
        fileNameDisplay.style.fontStyle = 'normal';
    } else {
        fileNameDisplay.textContent = 'Ningún archivo seleccionado';
        fileNameDisplay.style.color = '#64748b';
        fileNameDisplay.style.fontStyle = 'italic';
    }
});

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // 1. Validación de seguridad para el archivo
    if (!fileInput.files.length && !currentFile) {
        showToast("Por favor, selecciona un archivo primero.", "error");
        return;
    }
    
    const file = currentFile || fileInput.files[0];
    
    // 2. Validación de seguridad para el EPSG (Evita el error "Cannot read properties of null")
    const epsgInputEl = document.getElementById('epsgInput');
    const epsgValue = (epsgInputEl && epsgInputEl.value) ? parseInt(epsgInputEl.value) : null;

    setLoading(true);

    const formData = new FormData();
    formData.append('file', file);
    if (epsgValue) formData.append('source_epsg', epsgValue);

    try {
        const response = await fetch('/api/v1/geojson/process', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            if (response.status === 400 && data.detail.error === "CRS Desconocido") {
                handleUnknownCRSError(data.detail);
            } else {
                showToast(data.detail.message || "Error desconocido", "error");
            }
            return;
        }

        // Éxito
        currentFile = null; 
        showToast(`✅ <b>${data.data.feature_count}</b> features procesados.<br>CRS: ${data.data.original_crs || 'Asumido 4326'} ➡️ ${data.data.target_crs}`, 'success', 5000);
        
        if (data.warnings && data.warnings.length > 0) {
            showToast(data.warnings.join(" "), 'warning', 8000);
        }
        
        // Dibujar el mapa
        drawMap(data.data.geojson_data, data.data.bounds);

    } catch (err) {
        console.error("Error detallado:", err);
        showToast(`Error de red o del servidor: ${err.message}`, "error", 0);
    } finally {
        setLoading(false);
    }
});

// Manejo específico del escenario de "Imposibilidad" con 3 opciones
function handleUnknownCRSError(detail) {
    errorArea.innerHTML = `
        <strong>⚠️ CRS Unknown</strong><br>
        ${detail.message}<br><br>
        <div style="display: flex; gap: 10px; margin-top: 10px;">
            <button class="btn btn-primary" onclick="enableEpsgInput()">1. Enter EPSG</button>
            <button class="btn btn-secondary" onclick="resetForm()">2. Change File</button>
            <button class="btn btn-secondary" onclick="resetForm()">3. Cancel</button>
        </div>
    `;
    errorArea.classList.remove('hidden');
    
    // Guardar el archivo actual en memoria para permitir el reintento sin volver a seleccionarlo
    currentFile = fileInput.files[0];
    fileInput.classList.add('hidden'); // Ocultar input de archivo temporalmente
}

// Funciones de UI globales para los botones inline
window.enableEpsgInput = function() {
    epsgGroup.classList.remove('hidden');
    epsgInput.focus();
    errorArea.classList.add('hidden'); // Ocultar el error para limpiar la vista
};

window.resetForm = function() {
    form.reset();
    currentFile = null;
    epsgGroup.classList.add('hidden');
    fileInput.classList.remove('hidden');
    clearMessages();
};

function showSuccess(data) {
    successArea.innerHTML = `
        <strong> Loading Successfull</strong><br>
        • Features: ${data.feature_count}<br>
        • Geometrías: ${data.geometry_types.join(', ')}<br>
        • CRS Original: ${data.original_crs || 'Unknown (Assumed 4326)'}<br>
        • CRS Destino: ${data.target_crs}<br>
        • Límites: [${data.bounds.join(', ')}]
    `;
    successArea.classList.remove('hidden');
}

function showWarning(message) {
    warningArea.textContent = message;
    warningArea.classList.remove('hidden');
}

function showError(message) {
    // Si es un objeto (detalle de FastAPI), formatearlo
    const msg = typeof message === 'object' ? message.message || JSON.stringify(message) : message;
    errorArea.innerHTML = `<strong>Error:</strong> ${msg}`;
    errorArea.classList.remove('hidden');
}

function clearMessages() {
    successArea.classList.add('hidden');
    warningArea.classList.add('hidden');
    errorArea.classList.add('hidden');
}

function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.textContent = isLoading ? 'Loading...' : 'Loading File';
    if (isLoading) {
        cancelBtn.classList.remove('hidden');
    } else {
        cancelBtn.classList.add('hidden');
    }
}

// NUEVA FUNCIÓN: Lógica de Leaflet
function drawMap(geojsonData, bounds) {
    // 1. Validación de seguridad
    const mapContainer = document.getElementById('map');
    if (!mapContainer) {
        console.error("No se encontró el contenedor del mapa con id='map' en el HTML.");
        return;
    }

    // 2. Mostrar el contenedor
    mapContainer.classList.remove('hidden');

    // 3. Destruir mapa anterior si existe (Leaflet no permite inicializar dos veces el mismo div)
    if (mapInstance) {
        mapInstance.remove();
        mapInstance = null;
    }

    // 4. Crear el mapa
    mapInstance = L.map('map').setView([0, 0], 2);

    // 5. Capa base (OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(mapInstance);

    // 6. Dibujar el GeoJSON
    if (geojsonData && geojsonData.features) {
        geojsonLayer = L.geoJSON(geojsonData, {
            style: { color: "#2563eb", weight: 2, fillColor: "#3b82f6", fillOpacity: 0.4 },
            onEachFeature: function (feature, layer) {
                if (feature.properties) {
                    let popupContent = "<div style='min-width: 150px;'><b> Properties:</b><br><ul style='margin: 5px 0; padding-left: 20px; font-size: 0.9em;'>";
                    let hasData = false;
                    let firstPropertyFound = null;

                    for (let key in feature.properties) {
                        const value = feature.properties[key];
                        // Filtramos null, undefined y strings vacíos. 
                        // (Nota: esto preserva valores como 0 o false, que sí queremos mostrar)
                        if (value !== null && value !==  undefined && value !=="" ) {
                            // Formateamos la clave para que se vea bonita (ej. "nombre_comun" -> "Nombre comun")
                            const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                            popupContent += `<li style="margin-bottom: 4px;"><b>${formattedKey}:</b> ${value}</li>`;
                            
                            // Guardamos el primer dato válido para el tooltip (hover)
                            if (!firstPropertyFound) {
                                firstPropertyFound = value; 
                            }
                            hasData = true;
                        }   
                    }

                    popupContent += "</ul></div>";
                    // Solo vinculamos el popup si hay al menos un dato válido
                    if (hasData) {
                        layer.bindPopup(popupContent);
                    }

                    // 2. TOOLTIP (Hover): Muestra solo el primer dato (ej. el nombre del país)
                    if (firstPropertyFound) {
                        layer.bindTooltip(String(firstPropertyFound), {
                            sticky: true, // El tooltip sigue al mouse
                            direction: 'top',
                            offset: [0, -10]
                        });
                    }                    
                    
                }
            }
        }).addTo(mapInstance);

        // 7. Ajustar el zoom a los límites de los datos
        if (geojsonLayer.getBounds().isValid()) {
            mapInstance.fitBounds(geojsonLayer.getBounds(), { padding: [20, 20] });
        }
    } else {
        console.warn("No hay datos GeoJSON válidos para dibujar.");
    }
}

// Asegúrate de que resetForm() también oculte el mapa si se cancela
window.resetForm = function() {
    form.reset();
    currentFile = null;
    epsgGroup.classList.add('hidden');
    fileInput.classList.remove('hidden');
    clearMessages();
    
    // NUEVO: Ocultar y limpiar el mapa al reiniciar
    document.getElementById('map').classList.add('hidden');
    if (mapInstance) {
        mapInstance.remove();
        mapInstance = null;
    }
};

cancelBtn.addEventListener('click', () => {
    // Abortar o resetear
    resetForm();
});

// --- NUEVA FUNCIÓN: Sistema de Toasts ---
function showToast(message, type = 'success', duration = 4000) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    
    toast.className = `toast ${type}`;
    
    // Iconos según el tipo
    const icons = { success: '✅', warning: '⚠️', error: '❌' };
    const titles = { success: 'Success', warning: 'Warning', error: 'Error' };
    
    toast.innerHTML = `
        <strong>${icons[type]} ${titles[type]}</strong><br>
        <span style="font-size: 0.85rem; color: #64748b;">${message}</span>
    `;
    
    container.appendChild(toast);

    // Auto-eliminar después de 'duration' milisegundos
    setTimeout(() => {
        toast.classList.add('hiding');
        toast.addEventListener('animationend', () => toast.remove());
    }, duration);
}

// --- MODIFICAR TUS FUNCIONES EXISTENTES ---

// Reemplaza tu función showSuccess actual por esta:
function showSuccess(data) {
    // En lugar de llenar un div grande, mostramos un toast compacto
    const msg = `
        <b>${data.feature_count}</b> features loaded.<br>
        CRS: ${data.original_crs || 'Asumed 4326'} ️ ${data.target_crs}
    `;
    showToast(msg, 'success', 5000);
}

// Reemplaza tu función showWarning actual por esta:
function showWarning(message) {
    showToast(message, 'warning', 8000); // Las advertencias duran un poco más
}

// Reemplaza tu función showError actual por esta:
function showError(message) {
    const msg = typeof message === 'object' ? (message.message || JSON.stringify(message)) : message;
    showToast(msg, 'error', 0); // duration = 0 significa que no se cierra solo (el usuario debe recargar o cancelar)
}

// --- LIMPIEZA ---
// Ya no necesitas la función clearMessages() si usas toasts, 
// pero puedes dejarla vacía para evitar errores si se llama en otro lado:
function clearMessages() {
    // Los toasts se auto-limpian, no necesitamos hacer nada aquí.
}