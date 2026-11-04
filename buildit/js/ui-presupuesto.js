/**
 * /js/ui-presupuesto.js
 * Gestión del panel de presupuesto, desglose de costos, alternativas de gama, exportación CSV e impresión PDF.
 */

import { formatearMoneda, mostrarNotificacion } from './utilidades.js';
import { LISTA_MATERIALES } from './materiales-datos.js';

export class UIPresupuesto {
    /**
     * @param {Object} calculadoraPresupuesto - Instancia del motor CalculadoraPresupuesto.
     * @param {Object} gestorElementos - Instancia de GestorElementos.
     * @param {Object} callbacks - Callbacks de aplicación de propuestas.
     */
    constructor(calculadoraPresupuesto, gestorElementos, callbacks = {}) {
        if (!calculadoraPresupuesto || !gestorElementos) {
            throw new Error("Se requieren CalculadoraPresupuesto y GestorElementos en UIPresupuesto.");
        }

        this.calculadora = calculadoraPresupuesto;
        this.gestorElementos = gestorElementos;
        this.callbacks = callbacks;
        this.totalMostrado = 0;
        this.totalPresupuestoVisible = null;
        this.animacionTotal = null;
        this.propuestaAlternativa = null;
        this.materialesPropuestosSeleccionados = new Set();

        this.inicializarEventosPresupuesto();
        this.actualizarVistaPresupuesto();
    }

    /**
     * Configura los escuchas de eventos para botones de alternativas, CSV e impresión.
     */
    inicializarEventosPresupuesto() {
        const btnAltBarata = document.getElementById('btn-alt-barata');
        const btnAltPremium = document.getElementById('btn-alt-premium');
        const btnExportarCsv = document.getElementById('btn-exportar-csv');
        const btnImprimirPdf = document.getElementById('btn-imprimir-pdf');
        const botonCalculoDirecto = document.getElementById('presupuesto-calculo-directo');
        const notaManoObra = document.getElementById('presupuesto-nota-mano-obra');
        const selectorOrigen = document.getElementById('presupuesto-origen-calculo');
        const seccionManual = document.getElementById('presupuesto-manual');
        const formularioManual = document.getElementById('form-material-manual');
        const listaManual = document.getElementById('lista-materiales-manuales');
        const catalogoManual = document.getElementById('catalogo-materiales-manuales');
        const sugerenciaManual = document.getElementById('manual-material-sugerencia');
        const botonesAlternativa = document.querySelector('.presupuesto-alternativas');
        const claveMaterialesManuales = 'sketchplus-materiales-manuales-bogota-v1';
        let materialesManuales = [];
        try {
            const guardados = JSON.parse(localStorage.getItem(claveMaterialesManuales) || '[]');
            if (Array.isArray(guardados)) {
                materialesManuales = guardados.filter(material =>
                    material
                    && typeof material.numero === 'string'
                    && typeof material.nombre === 'string'
                    && typeof material.referencia === 'string'
                    && Number.isFinite(material.cantidad)
                    && material.cantidad > 0
                    && Number.isFinite(material.precioUnitario)
                    && material.precioUnitario > 0
                    && typeof material.unidad === 'string'
                    && typeof material.fuentePrecio === 'string'
                    && typeof material.fechaPrecio === 'string'
                );
            }
        } catch (error) {
            console.error('No se pudieron cargar los materiales manuales guardados:', error);
            mostrarNotificacion('No se pudieron recuperar los materiales manuales guardados.', 'error');
        }
        this.calculadora.setMaterialesManuales(materialesManuales);
        this.materialesManuales = materialesManuales;
        const siguienteNumeroMaterial = () => {
            let numero = 1;
            while (this.materialesManuales.some(material => material.numero === `M-${numero}`)) {
                numero += 1;
            }
            return `M-${numero}`;
        };

        const guardarMaterialesManuales = () => {
            try {
                localStorage.setItem(claveMaterialesManuales, JSON.stringify(this.materialesManuales));
            } catch (error) {
                console.error('No se pudieron guardar los materiales manuales:', error);
                mostrarNotificacion('No se pudieron guardar los materiales manuales en este dispositivo.', 'error');
            }
        };

        if (catalogoManual) {
            catalogoManual.replaceChildren();
            LISTA_MATERIALES.forEach(material => {
                const opcion = document.createElement('option');
                opcion.value = material.nombre;
                opcion.label = `${material.nombre} · ${material.id}`;
                catalogoManual.appendChild(opcion);
            });
        }

        const campoNombreManual = formularioManual && formularioManual.elements.namedItem('nombre');
        if (campoNombreManual && formularioManual) {
            campoNombreManual.addEventListener('input', () => {
                const texto = campoNombreManual.value.trim().toLocaleLowerCase('es-CO');
                const material = LISTA_MATERIALES.find(item =>
                    item.nombre.toLocaleLowerCase('es-CO') === texto || item.id.toLowerCase() === texto
                );
                if (!material) {
                    if (sugerenciaManual) sugerenciaManual.textContent = '';
                    return;
                }
                const campoReferencia = formularioManual.elements.namedItem('referencia');
                const campoUnidad = formularioManual.elements.namedItem('unidad');
                if (campoReferencia && !campoReferencia.value) campoReferencia.value = material.id;
                if (campoUnidad && !campoUnidad.value) campoUnidad.value = material.unidad;
                if (sugerenciaManual) {
                    sugerenciaManual.textContent = `Referencia del catálogo: ${material.id}. Resistencia registrada: ${material.resistencia || 'no especificada'}. Confirma el precio unitario con una fuente vigente de Bogotá.`;
                }
            });
        }

        if (formularioManual) {
            const campoNumero = formularioManual.elements.namedItem('numero');
            const campoFechaPrecio = formularioManual.elements.namedItem('fechaPrecio');
            const ahora = new Date();
            const fechaHoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
            if (campoNumero) campoNumero.value = siguienteNumeroMaterial();
            if (campoFechaPrecio) campoFechaPrecio.max = fechaHoy;
        }

        const renderizarMaterialesManuales = () => {
            if (!listaManual) return;
            listaManual.replaceChildren();
            this.materialesManuales.forEach((material, indice) => {
                const fila = document.createElement('tr');
                const valores = [
                    material.numero,
                    `${material.nombre}${material.referencia ? ` · ${material.referencia}` : ''}`,
                    material.cantidad,
                    material.unidad,
                    formatearMoneda(material.precioUnitario),
                    `${material.tipoFuentePrecio || 'Fuente'} · ${material.fuentePrecio} · ${material.fechaPrecio}`,
                    formatearMoneda(material.cantidad * material.precioUnitario)
                ];
                valores.forEach(valor => {
                    const celda = document.createElement('td');
                    celda.textContent = String(valor);
                    fila.appendChild(celda);
                });
                const celdaAccion = document.createElement('td');
                const botonEliminar = document.createElement('button');
                botonEliminar.type = 'button';
                botonEliminar.className = 'btn-eliminar-material-manual';
                botonEliminar.setAttribute('aria-label', `Eliminar ${material.nombre}`);
                botonEliminar.title = 'Eliminar material';
                botonEliminar.textContent = '×';
                botonEliminar.addEventListener('click', () => {
                    this.materialesManuales.splice(indice, 1);
                    this.calculadora.setMaterialesManuales(this.materialesManuales);
                    guardarMaterialesManuales();
                    renderizarMaterialesManuales();
                    this.actualizarVistaPresupuesto();
                });
                celdaAccion.appendChild(botonEliminar);
                fila.appendChild(celdaAccion);
                listaManual.appendChild(fila);
            });
        };

        const actualizarOrigen = () => {
            const modoManual = selectorOrigen && selectorOrigen.value === 'manual';
            this.calculadora.setModoCalculo(modoManual ? 'manual' : 'plano');
            if (seccionManual) seccionManual.hidden = !modoManual;
            if (botonesAlternativa) botonesAlternativa.hidden = modoManual;
            if (botonCalculoDirecto) botonCalculoDirecto.hidden = modoManual;
            if (notaManoObra) {
                notaManoObra.hidden = modoManual;
                notaManoObra.textContent = modoManual
                    ? 'Cálculo manual: solo se usan las cantidades y precios ingresados.'
                    : this.calculadora.soloMateriales
                        ? 'Activo: solo materiales calculados según las cantidades del plano.'
                        : 'Desactivado: se suma mano de obra estimada equivalente al 30% de materiales.';
            }
            this.actualizarVistaPresupuesto();
        };

        if (selectorOrigen) {
            selectorOrigen.addEventListener('change', actualizarOrigen);
            actualizarOrigen();
        }

        if (formularioManual) {
            formularioManual.addEventListener('submit', evento => {
                evento.preventDefault();
                const datos = new FormData(formularioManual);
                const numero = String(datos.get('numero') || '').trim();
                const nombre = String(datos.get('nombre') || '').trim();
                const referencia = String(datos.get('referencia') || '').trim();
                const unidad = String(datos.get('unidad') || '').trim();
                const cantidad = Number(datos.get('cantidad'));
                const precioUnitario = Number(datos.get('precioUnitario'));
                const tipoFuentePrecio = String(datos.get('tipoFuentePrecio') || '').trim();
                const fuentePrecio = String(datos.get('fuentePrecio') || '').trim();
                const fechaPrecio = String(datos.get('fechaPrecio') || '').trim();
                const ahora = new Date();
                const fechaHoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
                if (!numero || !nombre || !unidad || !Number.isFinite(cantidad) || cantidad <= 0
                    || !Number.isFinite(precioUnitario) || precioUnitario <= 0
                    || !referencia || !tipoFuentePrecio || !fuentePrecio || !fechaPrecio
                    || fechaPrecio > fechaHoy) {
                    mostrarNotificacion('Completa el producto, referencia, cantidad, unidad, precio, fuente y fecha válida.', 'error');
                    return;
                }
                if (this.materialesManuales.some(material => material.numero === numero)) {
                    mostrarNotificacion('Ese N.º ya existe. Usa un número diferente para cada material.', 'error');
                    return;
                }
                this.materialesManuales.push({
                    numero,
                    nombre,
                    referencia,
                    cantidad,
                    unidad,
                    precioUnitario,
                    tipoFuentePrecio,
                    fuentePrecio,
                    fechaPrecio,
                    ciudad: 'Bogotá D.C.'
                });
                this.calculadora.setMaterialesManuales(this.materialesManuales);
                formularioManual.reset();
                const campoNumero = formularioManual.elements.namedItem('numero');
                const campoFechaPrecio = formularioManual.elements.namedItem('fechaPrecio');
                if (campoNumero) campoNumero.value = siguienteNumeroMaterial();
                if (campoFechaPrecio) campoFechaPrecio.max = fechaHoy;
                if (sugerenciaManual) sugerenciaManual.textContent = '';
                guardarMaterialesManuales();
                renderizarMaterialesManuales();
                this.actualizarVistaPresupuesto();
            });
        }

        if (botonCalculoDirecto) {
            const actualizarModoCalculo = (activo) => {
                this.calculadora.setSoloMateriales(activo);
                botonCalculoDirecto.setAttribute('aria-pressed', String(activo));
                botonCalculoDirecto.classList.toggle('activo', activo);
                const estado = botonCalculoDirecto.querySelector('.presupuesto-calculo-estado');
                if (estado) estado.textContent = activo ? 'Activado' : 'Desactivado';
                if (notaManoObra) {
                    notaManoObra.textContent = activo
                        ? 'Activo: solo materiales calculados según las cantidades del plano.'
                        : 'Desactivado: se suma mano de obra estimada equivalente al 30% de materiales.';
                }
            };
            const modoInicial = botonCalculoDirecto.getAttribute('aria-pressed') === 'true';
            actualizarModoCalculo(modoInicial);
            botonCalculoDirecto.addEventListener('click', () => {
                if (this.calculadora.modoCalculo === 'manual') return;
                const activar = botonCalculoDirecto.getAttribute('aria-pressed') !== 'true';
                actualizarModoCalculo(activar);
                this.actualizarVistaPresupuesto();
            });
        }

        if (btnAltBarata) {
            btnAltBarata.addEventListener('click', () => {
                this.mostrarPropuestaAlternativa('economica');
            });
        }

        if (btnAltPremium) {
            btnAltPremium.addEventListener('click', () => {
                this.mostrarPropuestaAlternativa('premium');
            });
        }

        const botonCerrarAlternativa = document.getElementById('cerrar-alternativa-propuesta');
        if (botonCerrarAlternativa) {
            botonCerrarAlternativa.addEventListener('click', () => this.cerrarPropuestaAlternativa());
        }

        const botonAplicarAlternativa = document.getElementById('aplicar-alternativa-propuesta');
        if (botonAplicarAlternativa) {
            botonAplicarAlternativa.addEventListener('click', () => {
                const cambios = (this.propuestaAlternativa?.cambios || [])
                    .filter(cambio => this.materialesPropuestosSeleccionados.has(cambio.idElemento));
                if (!cambios.length) {
                    mostrarNotificacion('Selecciona al menos un cambio antes de aplicarlo.', 'info');
                    return;
                }
                if (typeof this.callbacks.onAlternativaAplicada !== 'function') {
                    mostrarNotificacion('No se pudo aplicar la propuesta al plano.', 'error');
                    return;
                }
                try {
                    this.callbacks.onAlternativaAplicada(cambios);
                    this.cerrarPropuestaAlternativa();
                    this.actualizarVistaPresupuesto();
                    mostrarNotificacion(`Se aplicaron ${cambios.length} sustituciones al plano. Puedes deshacerlas con Ctrl+Z.`, 'success');
                } catch (error) {
                    console.error('No se pudo aplicar la propuesta de materiales:', error);
                    mostrarNotificacion(error.message || 'No se pudo aplicar la propuesta de materiales.', 'error');
                }
            });
        }

        if (btnExportarCsv) {
            btnExportarCsv.addEventListener('click', () => {
                this.exportarPresupuestoCSV();
            });
        }

        if (btnImprimirPdf) {
            btnImprimirPdf.addEventListener('click', () => {
                window.print();
            });
        }
    }

    mostrarPropuestaAlternativa(gama) {
        const propuesta = this.calculadora.obtenerPropuestaAlternativa(gama);
        const panel = document.getElementById('alternativa-propuesta');
        const titulo = document.getElementById('alternativa-propuesta-titulo');
        const resumen = document.getElementById('alternativa-propuesta-resumen');
        const lista = document.getElementById('alternativa-propuesta-lista');
        const total = document.getElementById('alternativa-propuesta-total');
        const botonAplicar = document.getElementById('aplicar-alternativa-propuesta');
        if (!panel || !titulo || !resumen || !lista || !total || !botonAplicar) {
            throw new Error('No se encontró el panel para mostrar la propuesta de materiales.');
        }

        this.propuestaAlternativa = propuesta;
        this.materialesPropuestosSeleccionados = new Set(
            propuesta.cambios.map(cambio => cambio.idElemento)
        );
        titulo.textContent = gama === 'economica'
            ? 'Propuesta de menor costo'
            : 'Propuesta de mejor desempeño';
        lista.replaceChildren();

        if (!propuesta.cambios.length) {
            resumen.textContent = `Se analizaron ${propuesta.elementosAnalizados} elementos. No hay sustituciones seguras disponibles en el catálogo para esta opción.`;
            const mensaje = document.createElement('p');
            mensaje.className = 'alternativa-sin-cambios';
            mensaje.textContent = 'No se encontró una alternativa comparable que mantenga o mejore la resistencia y el uso del material.';
            lista.appendChild(mensaje);
            total.textContent = formatearMoneda(propuesta.totalActual);
            botonAplicar.disabled = true;
            panel.hidden = false;
            return;
        }

        resumen.textContent = `Se analizaron ${propuesta.elementosAnalizados} elementos completos; ${propuesta.cambios.length} tienen sustituciones compatibles. Los demás permanecen en el total sin cambios.`;
        const actualizarTotalPropuesto = () => {
            const nuevoTotal = propuesta.totalActual + propuesta.cambios
                .filter(cambio => this.materialesPropuestosSeleccionados.has(cambio.idElemento))
                .reduce((suma, cambio) =>
                    suma + (cambio.costoPropuesto - cambio.costoActual) * propuesta.factorCosto,
                0);
            total.textContent = formatearMoneda(nuevoTotal);
            botonAplicar.disabled = this.materialesPropuestosSeleccionados.size === 0;
        };

        propuesta.cambios.forEach(cambio => {
            const fila = document.createElement('article');
            fila.className = 'alternativa-material-fila';
            const seleccion = document.createElement('input');
            seleccion.type = 'checkbox';
            seleccion.checked = true;
            seleccion.setAttribute('aria-label', `Incluir sustitución para ${cambio.materialActual.nombre}`);
            seleccion.addEventListener('change', () => {
                if (seleccion.checked) this.materialesPropuestosSeleccionados.add(cambio.idElemento);
                else this.materialesPropuestosSeleccionados.delete(cambio.idElemento);
                actualizarTotalPropuesto();
            });

            const detalle = document.createElement('div');
            detalle.className = 'alternativa-material-detalle';
            const nombre = document.createElement('strong');
            nombre.textContent = `${cambio.tipo}: ${cambio.materialActual.nombre} → ${cambio.materialPropuesto.nombre}`;
            const resistencia = document.createElement('span');
            resistencia.textContent = `Resistencia: ${cambio.resistenciaActual} → ${cambio.resistenciaPropuesta}`;
            const cantidad = document.createElement('span');
            cantidad.textContent = `Cantidad requerida: ${cambio.cantidadActual} ${cambio.unidadActual} → ${cambio.cantidadPropuesta} ${cambio.unidadPropuesta}`;
            const costo = document.createElement('span');
            const diferencia = cambio.costoPropuesto - cambio.costoActual;
            costo.textContent = `Costo completo: ${formatearMoneda(cambio.costoActual)} → ${formatearMoneda(cambio.costoPropuesto)} (${diferencia <= 0 ? 'ahorro' : 'incremento'} ${formatearMoneda(Math.abs(diferencia))})`;
            detalle.append(nombre, resistencia, cantidad, costo);
            fila.append(seleccion, detalle);
            lista.appendChild(fila);
        });

        botonAplicar.disabled = false;
        actualizarTotalPropuesto();
        panel.hidden = false;
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    cerrarPropuestaAlternativa() {
        const panel = document.getElementById('alternativa-propuesta');
        if (panel) panel.hidden = true;
        this.propuestaAlternativa = null;
        this.materialesPropuestosSeleccionados.clear();
    }

    /**
     * Actualiza los elementos del DOM en la pestaña Presupuesto.
     * @param {number|null} costoAlternativo - Costo simulado opcional.
     * @param {string|null} etiquetaGama - Nombre de la gama simulada.
     * @param {string|null} gamaObjetivo - Identificador de la gama simulada.
     */
    actualizarVistaPresupuesto(costoAlternativo = null, etiquetaGama = null, gamaObjetivo = null) {
        const presupuestoTotalEl = document.getElementById('presupuesto-total');
        const desgloseContenedor = document.getElementById('presupuesto-desglose');

        if (!presupuestoTotalEl || !desgloseContenedor) return;

        const resultado = this.calculadora.calcularPresupuestoTotal(gamaObjetivo);
        const costoMostrar = costoAlternativo !== null ? costoAlternativo : resultado.costoTotal;
        this.totalPresupuestoVisible = costoMostrar;
        const modoEl = document.getElementById('presupuesto-modo');
        const elementosEl = document.getElementById('presupuesto-elementos');
        const cantidadElementos = Object.values(resultado.desglose)
            .filter(datos => !datos.esServicio)
            .reduce((cantidad, datos) => cantidad + datos.items, 0);

        this.animarTotal(presupuestoTotalEl, costoMostrar);
        if (modoEl) {
            modoEl.textContent = this.calculadora.modoCalculo === 'manual'
                ? 'Cálculo manual'
                : etiquetaGama === 'Menor costo'
                ? etiquetaGama
                : etiquetaGama
                    ? `Gama ${etiquetaGama}`
                    : this.calculadora.soloMateriales
                        ? 'Cálculo directo'
                        : 'Materiales + mano de obra';
            modoEl.classList.toggle('simulacion-activa', Boolean(etiquetaGama));
        }
        if (elementosEl) {
            elementosEl.textContent = this.calculadora.modoCalculo === 'manual'
                ? `${cantidadElementos} ${cantidadElementos === 1 ? 'material' : 'materiales'} ingresados`
                : `${cantidadElementos} ${cantidadElementos === 1 ? 'elemento' : 'elementos'}`;
        }
        if (etiquetaGama) {
            presupuestoTotalEl.title = etiquetaGama === 'Menor costo'
                ? 'Alternativa de menor costo disponible'
                : `Simulación activa: Gama ${etiquetaGama}`;
        } else {
            presupuestoTotalEl.removeAttribute('title');
        }

        const desglose = resultado.desglose;
        desgloseContenedor.replaceChildren();

        const titulo = document.createElement('h4');
        titulo.className = 'presupuesto-desglose-titulo';
        titulo.textContent = 'Distribución por categoría';
        desgloseContenedor.appendChild(titulo);

        if (!Object.keys(desglose).length) {
            const vacio = document.createElement('div');
            vacio.className = 'presupuesto-vacio';
            vacio.innerHTML = this.calculadora.modoCalculo === 'manual'
                ? '<i class="fa-solid fa-calculator"></i><strong>Agrega materiales manualmente</strong><span>El total se calculará solo con las filas que registres arriba.</span>'
                : '<i class="fa-solid fa-chart-simple"></i><strong>Tu presupuesto empieza aquí</strong><span>Agrega elementos al plano para ver el costo y su distribución.</span>';
            desgloseContenedor.appendChild(vacio);
            return;
        }

        const totalCategorias = Object.values(desglose)
            .reduce((total, datos) => total + datos.costo, 0);
        const lista = document.createElement('div');
        lista.className = 'presupuesto-categorias';
        const colores = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

        Object.entries(desglose)
            .sort(([, a], [, b]) => b.costo - a.costo)
            .forEach(([categoria, datos], indice) => {
                const porcentaje = totalCategorias > 0 ? (datos.costo / totalCategorias) * 100 : 0;
                const fila = document.createElement('article');
                fila.className = 'presupuesto-categoria';
                fila.style.setProperty('--categoria-color', colores[indice % colores.length]);
                fila.style.setProperty('--barra-progreso', `${porcentaje}%`);

                const encabezado = document.createElement('div');
                encabezado.className = 'presupuesto-categoria-encabezado';
                const nombreGrupo = document.createElement('div');
                nombreGrupo.className = 'presupuesto-categoria-nombre';
                const indicador = document.createElement('span');
                indicador.className = 'presupuesto-categoria-indicador';
                indicador.setAttribute('aria-hidden', 'true');
                const nombre = document.createElement('strong');
                nombre.textContent = categoria;
                const cantidad = document.createElement('span');
                cantidad.className = 'presupuesto-categoria-cantidad';
                cantidad.textContent = datos.esServicio
                    ? 'Estimado'
                    : `${datos.items} ${datos.items === 1 ? 'elemento' : 'elementos'}`;
                nombreGrupo.append(indicador, nombre, cantidad);

                const costo = document.createElement('strong');
                costo.className = 'presupuesto-categoria-costo';
                costo.textContent = formatearMoneda(datos.costo);
                encabezado.append(nombreGrupo, costo);

                const barra = document.createElement('div');
                barra.className = 'presupuesto-barra';
                barra.setAttribute('role', 'progressbar');
                barra.setAttribute('aria-label', `${categoria}: ${porcentaje.toFixed(0)}% del presupuesto`);
                barra.setAttribute('aria-valuenow', porcentaje.toFixed(0));
                barra.setAttribute('aria-valuemin', '0');
                barra.setAttribute('aria-valuemax', '100');
                barra.innerHTML = '<span></span>';
                fila.append(encabezado, barra);
                lista.appendChild(fila);
            });

        desgloseContenedor.appendChild(lista);
    }

    animarTotal(elemento, total) {
        if (this.animacionTotal !== null) {
            window.cancelAnimationFrame(this.animacionTotal);
        }

        const inicio = this.totalMostrado;
        const diferencia = total - inicio;
        const horaInicio = performance.now();
        const duracion = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 550;

        if (!duracion) {
            this.totalMostrado = total;
            elemento.textContent = formatearMoneda(total);
            return;
        }

        const actualizar = (ahora) => {
            const progreso = Math.min((ahora - horaInicio) / duracion, 1);
            const suavizado = 1 - Math.pow(1 - progreso, 3);
            this.totalMostrado = inicio + diferencia * suavizado;
            elemento.textContent = formatearMoneda(this.totalMostrado);
            if (progreso < 1) {
                this.animacionTotal = window.requestAnimationFrame(actualizar);
            } else {
                this.totalMostrado = total;
                this.animacionTotal = null;
            }
        };
        this.animacionTotal = window.requestAnimationFrame(actualizar);
    }

    /**
     * Genera y descarga un archivo CSV con el desglose de materiales y costos.
     */
    exportarPresupuestoCSV() {
        try {
            let csvContenido = 'N.º,Nombre,Referencia,Cantidad,Unidad,Precio unitario (COP),Tipo de fuente,Referencia de fuente,Fecha del precio,Ciudad,Total (COP)\n';
            const escaparCsv = valor => {
                const texto = String(valor ?? '');
                const seguro = /^[=+\-@]/.test(texto) ? `'${texto}` : texto;
                return `"${seguro.replace(/"/g, '""')}"`;
            };

            if (this.calculadora.modoCalculo === 'manual') {
                this.materialesManuales.forEach(material => {
                    csvContenido += [
                        material.numero,
                        material.nombre,
                        material.referencia,
                        material.cantidad,
                        material.unidad,
                        material.precioUnitario,
                        material.tipoFuentePrecio,
                        material.fuentePrecio,
                        material.fechaPrecio,
                        material.ciudad || 'Bogotá D.C.',
                        material.cantidad * material.precioUnitario,
                    ].map(escaparCsv).join(',') + '\n';
                });
            } else {
                csvContenido = 'ID,Tipo,Material,Cantidad,Unidad,Costo Unitario (COP),Costo Total (COP)\n';
                this.gestorElementos.elementosModelo.forEach(el => {
                    const calculo = this.calculadora.calcularElemento(el);
                    if (calculo && calculo.material) {
                        const fila = [
                            el.id,
                            el.tipo,
                            calculo.material.nombre,
                            calculo.cantidadNecesaria,
                            calculo.unidadCompra,
                            calculo.costoUnitario,
                            calculo.costoTotal
                        ].map(escaparCsv).join(',');
                        csvContenido += fila + '\n';
                    }
                });

                if (!this.calculadora.soloMateriales) {
                    const subtotalMateriales = this.gestorElementos.elementosModelo.reduce((subtotal, elemento) => {
                        const calculo = this.calculadora.calcularElemento(elemento);
                        return subtotal + (calculo && calculo.material ? calculo.costoTotal : 0);
                    }, 0);
                    const costoManoObra = subtotalMateriales * this.calculadora.porcentajeManoObra;
                    csvContenido += [
                        '',
                        'mano de obra',
                        `Estimación ${this.calculadora.porcentajeManoObra * 100}% del costo de materiales`,
                        '1',
                        'proyecto',
                        '',
                        costoManoObra
                    ].map(escaparCsv).join(',') + '\n';
                }
            }

            const url = URL.createObjectURL(new Blob(['\uFEFF', csvContenido], { type: 'text/csv;charset=utf-8' }));
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `presupuesto_construcalc_${Date.now()}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);

            mostrarNotificacion("Presupuesto exportado a CSV exitosamente.", "success");
        } catch (error) {
            console.error("Error al exportar CSV:", error.message);
            mostrarNotificacion("Error al exportar el archivo CSV.", "error");
        }
    }
}