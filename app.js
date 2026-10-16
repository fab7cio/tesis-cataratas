const SUPABASE_URL = "https://uubfvbyqiftfjwmbwzkl.supabase.co";
const SUPABASE_KEY = "sb_publishable_GaqcyHWVMyOdFjR0RvtI-Q_w90PHMK-";

const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Lote de imágenes activo: la evaluación y el dashboard solo usan este lote.
// Los lotes anteriores (p. ej. 'fondo_ojo') siguen en la base de datos pero no se muestran.
const LOTE_ACTUAL = 'lampara_hendidura';

let idMedicoActual = null;
let idImagenActual = null;
let imagenesEvaluadas = [];
let guardandoDiagnostico = false;

const pantallaRegistro = document.getElementById('pantalla-registro');
const pantallaEvaluacion = document.getElementById('pantalla-evaluacion');
const pantallaDashboard = document.getElementById('pantalla-dashboard');
const btnComenzar = document.getElementById('btn-comenzar');
const btnDiagnosticos = document.querySelectorAll('.btn-diagnostico');
const btnVolverEvaluacion = document.getElementById('btn-volver-evaluacion');
const tablaBody = document.getElementById('tabla-resultados-body');

btnComenzar.addEventListener('click', async () => {
    const nombre = document.getElementById('nombre-medico').value.trim();
    const biografia = document.getElementById('bio-medico').value.trim();

    if (!nombre) {
        alert("Por favor, ingrese su nombre para iniciar el protocolo.");
        return;
    }

    const { data, error } = await _supabase
        .from('medicos')
        .insert([{ nombre: nombre, biografia: biografia }])
        .select();

    if (error) {
        alert("Error de conexión al registrar: " + error.message);
        return;
    }

    idMedicoActual = data[0].id_medico;
    document.getElementById('tag-medico').innerText = `Médico: ${nombre}`;

    imagenesEvaluadas = [];

    pantallaRegistro.classList.add('d-none');
    pantallaEvaluacion.classList.remove('d-none');

    cargarSiguienteImagen();
});

async function cargarSiguienteImagen() {
    const { data: imagenes, error } = await _supabase
        .from('imagenes_ia')
        .select('id_imagen, ruta_archivo')
        .eq('lote', LOTE_ACTUAL);

    const errorCarga = document.getElementById('error-carga');

    if (error || !imagenes) {
        console.error("Error al cargar dataset:", error ? error.message : "sin datos");
        errorCarga.textContent = "No se pudo cargar la imagen. Revise su conexión e intente nuevamente.";
        errorCarga.classList.remove('d-none');
        return;
    }

    errorCarga.classList.add('d-none');

    const pendientes = imagenes.filter(img => !imagenesEvaluadas.includes(img.id_imagen));

    if (pendientes.length === 0) {
        document.getElementById('contenido-evaluacion').classList.add('d-none');
        document.getElementById('mensaje-fin').classList.remove('d-none');
        return;
    }

    const imagenAleatoria = pendientes[Math.floor(Math.random() * pendientes.length)];

    idImagenActual = imagenAleatoria.id_imagen;

    document.getElementById('imagen-ojo').src = imagenAleatoria.ruta_archivo;
}

btnDiagnosticos.forEach(boton => {
    boton.addEventListener('click', async (e) => {
        if (guardandoDiagnostico || idImagenActual === null) return;
        guardandoDiagnostico = true;
        btnDiagnosticos.forEach(b => b.disabled = true);

        const diagnosticoElegido = e.currentTarget.getAttribute('data-clase');
        const idImagenEvaluada = idImagenActual;

        try {
            const { error } = await _supabase
                .from('evaluacion_medico')
                .insert([
                    {
                        id_imagen: idImagenEvaluada,
                        id_medico: idMedicoActual,
                        diagnostico_medico: diagnosticoElegido
                    }
                ]);

            if (error) {
                alert("Error al almacenar el diagnóstico: " + error.message);
                return;
            }

            // Solo se marca como evaluada tras guardarse con éxito
            imagenesEvaluadas.push(idImagenEvaluada);
            idImagenActual = null;

            document.getElementById('imagen-ojo').src = "";
            await cargarSiguienteImagen();
        } finally {
            guardandoDiagnostico = false;
            btnDiagnosticos.forEach(b => b.disabled = false);
        }
    });
});

let datosCruceGlobal = [];

document.addEventListener('keydown', async (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'm') {

        pantallaRegistro.classList.add('d-none');
        pantallaEvaluacion.classList.add('d-none');
        pantallaDashboard.classList.remove('d-none');

        tablaBody.innerHTML = '<tr><td colspan="5" class="text-center">Consultando registros y cruzando datos...</td></tr>';

        const { data: cruce, error } = await _supabase
            .from('evaluacion_medico')
            .select(`
                id_imagen,
                id_medico,
                diagnostico_medico,
                imagenes_ia!inner ( prediccion_ia, ruta_archivo, lote ),
                medicos ( nombre )
            `)
            .eq('imagenes_ia.lote', LOTE_ACTUAL);

        if (error) {
            tablaBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Error: ${error.message}</td></tr>`;
            return;
        }

        datosCruceGlobal = cruce || [];

        const selectFiltro = document.getElementById('filtro-medico');
        selectFiltro.innerHTML = '<option value="todos">-- Mostrar Todos los Médicos --</option>';

        const medicosUnicos = new Map();
        datosCruceGlobal.forEach(fila => {
            if (fila.id_medico && fila.medicos && fila.medicos.nombre) {
                medicosUnicos.set(fila.id_medico, fila.medicos.nombre);
            }
        });

        medicosUnicos.forEach((nombreMed, idMed) => {
            const opcion = document.createElement('option');
            opcion.value = String(idMed);
            opcion.textContent = `${nombreMed} (ID ${idMed})`;
            selectFiltro.appendChild(opcion);
        });

        renderizarTabla(datosCruceGlobal);
    }
});

function renderizarTabla(datos) {
    tablaBody.innerHTML = '';

    if (datos.length === 0) {
        tablaBody.innerHTML = '<tr><td colspan="5" class="text-center">No hay registros para mostrar bajo este filtro.</td></tr>';
        limpiarMatrizVisual();
        return;
    }

    datos.forEach(fila => {
        const predIA = (fila.imagenes_ia && fila.imagenes_ia.prediccion_ia) || 'N/A';
        const urlFoto = fila.imagenes_ia ? fila.imagenes_ia.ruta_archivo : '';
        const diagMedico = fila.diagnostico_medico ? fila.diagnostico_medico : 'N/A';
        const nombreMed = fila.medicos ? fila.medicos.nombre : 'Anónimo';

        const coinciden = predIA.toLowerCase().trim() === diagMedico.toLowerCase().trim();
        const claseFila = coinciden ? 'table-success' : 'table-danger';
        const icono = coinciden ? '✅ Coincide' : '❌ No Coincide';

        tablaBody.innerHTML += `
            <tr class="${claseFila}">
                <td class="text-center" style="width: 110px;">
                    ${urlFoto ? `
                        <a href="${urlFoto}" target="_blank" title="Clic para ampliar original">
                            <img src="${urlFoto}" alt="Ojo" class="img-thumbnail" style="max-height: 65px; width: 90px; object-fit: cover; background-color: #000; cursor: pointer;">
                        </a>` : 'N/A'}
                </td>
                <td class="fw-semibold text-primary">${predIA}</td>
                <td class="fw-semibold text-dark">${diagMedico}</td>
                <td>${nombreMed}</td>
                <td class="fw-bold">${icono}</td>
            </tr>
        `;
    });

    calcularMatrizConfusion(datos);
}

function calcularMatrizConfusion(datos) {
    const clases = ['nuclear', 'cortical', 'subcapsular'];

    let matriz = {};
    clases.forEach(ia => {
        matriz[ia] = {};
        clases.forEach(medico => {
            matriz[ia][medico] = 0;
        });
    });

    datos.forEach(fila => {
        let predIA = (fila.imagenes_ia && fila.imagenes_ia.prediccion_ia)
            ? fila.imagenes_ia.prediccion_ia.toLowerCase().trim()
            : '';
        let diagMedico = fila.diagnostico_medico ? fila.diagnostico_medico.toLowerCase().trim() : '';

        if (predIA.includes('subcapsular')) predIA = 'subcapsular';
        if (predIA.includes('nuclear')) predIA = 'nuclear';
        if (predIA.includes('cortical')) predIA = 'cortical';

        if (diagMedico.includes('subcapsular')) diagMedico = 'subcapsular';
        if (diagMedico.includes('nuclear')) diagMedico = 'nuclear';
        if (diagMedico.includes('cortical')) diagMedico = 'cortical';

        if (clases.includes(predIA) && clases.includes(diagMedico)) {
            matriz[predIA][diagMedico]++;
        }
    });

    clases.forEach(ia => {
        clases.forEach(medico => {
            const celda = document.getElementById(`m-${ia}-${medico}`);
            if (celda) {
                const valor = matriz[ia][medico];
                celda.innerText = valor;

                if (ia === medico) {
                    celda.style.backgroundColor = valor > 0 ? '#d1e7dd' : '#f8f9fa';
                    celda.style.color = valor > 0 ? '#0f5132' : '#6c757d';
                } else {
                    celda.style.backgroundColor = valor > 0 ? '#f8d7da' : '#f8f9fa';
                    celda.style.color = valor > 0 ? '#842029' : '#6c757d';
                }
            }
        });
    });
}

function limpiarMatrizVisual() {
    const clases = ['nuclear', 'cortical', 'subcapsular'];
    clases.forEach(ia => {
        clases.forEach(medico => {
            const celda = document.getElementById(`m-${ia}-${medico}`);
            if (celda) {
                celda.innerText = '-';
                celda.style.backgroundColor = '#f8f9fa';
                celda.style.color = '#6c757d';
            }
        });
    });
}

document.getElementById('filtro-medico').addEventListener('change', (e) => {
    const medicoSeleccionado = e.target.value;

    if (medicoSeleccionado === 'todos') {
        renderizarTabla(datosCruceGlobal);
    } else {
        const datosFiltrados = datosCruceGlobal.filter(
            fila => String(fila.id_medico) === medicoSeleccionado
        );
        renderizarTabla(datosFiltrados);
    }
});

btnVolverEvaluacion.addEventListener('click', () => {
    pantallaDashboard.classList.add('d-none');
    if (idMedicoActual) {
        pantallaEvaluacion.classList.remove('d-none');
    } else {
        pantallaRegistro.classList.remove('d-none');
    }
});