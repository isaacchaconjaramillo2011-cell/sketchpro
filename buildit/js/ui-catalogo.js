/**
 * /js/ui-catalogo.js
 * Gestión del panel de catálogo de materiales: filtros, búsqueda, tarjetas interactivas y asignación.
 */

import { LISTA_MATERIALES } from './materiales-datos.js';
import { formatearMoneda, mostrarNotificacion } from './utilidades.js';

export class UICatalogo {
    /**
     * @param {Object} gestorElementos - Instancia de GestorElementos para aplicar materiales.
     * @param {Function} callbackActualizarPresupuesto - Función a ejecutar cuando cambia un material.
     */
    constructor(gestorElementos, callbackActualizarPresupuesto = null, callbackActivarPincel = null) {
        if (!gestorElementos) {
            throw new Error("Se requiere GestorElementos en UICatalogo.");
        }

        this.gestorElementos = gestorElementos;
        this.callbackActualizarPresupuesto = callbackActualizarPresupuesto;
        this.callbackActivarPincel = callbackActivarPincel;
        this.categoriaSeleccionada = '';
        this.textoBusqueda = '';
        this.materialSeleccionadoActivo = null;

        this.inicializarFiltrosDOM();
        this.renderizarTarjetasCatalogo();
    }

    /**
     * Llena el selector de categorías y configura los escuchas de eventos (búsqueda y filtros).
     */
    inicializarFiltrosDOM() {
        const selectCategoria = document.getElementById('catalogo-categoria');
        const inputBuscar = document.getElementById('catalogo-buscar');
        const listaSugerencias = document.getElementById('catalogo-sugerencias');

        if (!selectCategoria || !inputBuscar || !listaSugerencias) return;
        this.inputBuscar = inputBuscar;
        this.listaSugerencias = listaSugerencias;
        this.indiceSugerenciaActiva = -1;

        // Extraer categorías únicas de LISTA_MATERIALES
        const categoriasUnicas = [...new Set(LISTA_MATERIALES.map(m => m.categoria))];
        
        categoriasUnicas.forEach(cat => {
            const opcion = document.createElement('option');
            opcion.value = cat;
            opcion.textContent = cat;
            selectCategoria.appendChild(opcion);
        });

        // Evento de cambio de categoría
        selectCategoria.addEventListener('change', (e) => {
            this.categoriaSeleccionada = e.target.value;
            this.renderizarSugerencias();
            this.renderizarTarjetasCatalogo();
        });

        // Evento de búsqueda por texto
        inputBuscar.addEventListener('input', (e) => {
            this.textoBusqueda = e.target.value.toLowerCase().trim();
            this.renderizarSugerencias();
            this.renderizarTarjetasCatalogo();
        });

        inputBuscar.addEventListener('keydown', (evento) => {
            const sugerencias = this.listaSugerencias.querySelectorAll('[role="option"]');
            if (evento.key === 'ArrowDown' && sugerencias.length) {
                evento.preventDefault();
                this.indiceSugerenciaActiva = (this.indiceSugerenciaActiva + 1) % sugerencias.length;
                this.actualizarSugerenciaActiva();
            } else if (evento.key === 'ArrowUp' && sugerencias.length) {
                evento.preventDefault();
                this.indiceSugerenciaActiva = this.indiceSugerenciaActiva <= 0
                    ? sugerencias.length - 1
                    : this.indiceSugerenciaActiva - 1;
                this.actualizarSugerenciaActiva();
            } else if (evento.key === 'Enter' && this.indiceSugerenciaActiva >= 0) {
                evento.preventDefault();
                sugerencias[this.indiceSugerenciaActiva].click();
            } else if (evento.key === 'Escape') {
                this.ocultarSugerencias();
            }
        });

        inputBuscar.addEventListener('focus', () => this.renderizarSugerencias());
        inputBuscar.addEventListener('blur', () => {
            window.setTimeout(() => this.ocultarSugerencias(), 120);
        });
    }

    renderizarSugerencias() {
        const consulta = this.inputBuscar.value.trim().toLocaleLowerCase('es');
        this.listaSugerencias.replaceChildren();
        this.indiceSugerenciaActiva = -1;
        if (!consulta) {
            this.ocultarSugerencias();
            return;
        }

        const coincidencias = LISTA_MATERIALES
            .filter(material => {
                const categoriaCoincide = !this.categoriaSeleccionada
                    || material.categoria === this.categoriaSeleccionada;
                const texto = `${material.nombre} ${material.categoria} ${material.gama}`
                    .toLocaleLowerCase('es');
                return categoriaCoincide && texto.includes(consulta);
            })
            .slice(0, 7);

        if (!coincidencias.length) {
            this.ocultarSugerencias();
            return;
        }

        coincidencias.forEach(material => {
            const opcion = document.createElement('button');
            opcion.type = 'button';
            opcion.className = 'catalogo-sugerencia';
            opcion.setAttribute('role', 'option');
            opcion.setAttribute('aria-selected', 'false');

            const informacion = document.createElement('span');
            informacion.className = 'catalogo-sugerencia-info';
            const nombre = document.createElement('strong');
            nombre.textContent = material.nombre;
            const detalle = document.createElement('small');
            detalle.textContent = `${material.categoria} · ${material.gama}`;
            informacion.append(nombre, detalle);

            const precio = document.createElement('span');
            precio.className = 'catalogo-sugerencia-precio';
            precio.textContent = formatearMoneda(material.precioUnitario);
            opcion.append(informacion, precio);
            opcion.addEventListener('click', () => {
                this.inputBuscar.value = material.nombre;
                this.textoBusqueda = material.nombre.toLocaleLowerCase('es');
                this.ocultarSugerencias();
                this.renderizarTarjetasCatalogo();
                this.inputBuscar.focus();
            });
            this.listaSugerencias.appendChild(opcion);
        });

        this.listaSugerencias.hidden = false;
        this.inputBuscar.setAttribute('aria-expanded', 'true');
    }

    actualizarSugerenciaActiva() {
        const opciones = this.listaSugerencias.querySelectorAll('[role="option"]');
        opciones.forEach((opcion, indice) => {
            const activa = indice === this.indiceSugerenciaActiva;
            opcion.classList.toggle('active', activa);
            opcion.setAttribute('aria-selected', String(activa));
        });
    }

    ocultarSugerencias() {
        this.listaSugerencias.hidden = true;
        this.inputBuscar.setAttribute('aria-expanded', 'false');
        this.indiceSugerenciaActiva = -1;
    }

    /**
     * Filtra y renderiza las tarjetas de productos en el contenedor DOM `#catalogo-lista`.
     */
    renderizarTarjetasCatalogo() {
        const contenedorLista = document.getElementById('catalogo-lista');
        if (!contenedorLista) return;

        // Filtrar materiales
        const materialesFiltrados = LISTA_MATERIALES.filter(m => {
            const coincideCategoria = this.categoriaSeleccionada === '' || m.categoria === this.categoriaSeleccionada;
            const coincideTexto = this.textoBusqueda === '' || 
                m.nombre.toLowerCase().includes(this.textoBusqueda) || 
                m.categoria.toLowerCase().includes(this.textoBusqueda);
            return coincideCategoria && coincideTexto;
        });

        contenedorLista.innerHTML = '';

        if (materialesFiltrados.length === 0) {
            contenedorLista.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-box-open"></i>
                    <p>No se encontraron materiales con esos criterios.</p>
                </div>
            `;
            return;
        }

        materialesFiltrados.forEach(material => {
            const tarjeta = document.createElement('div');
            tarjeta.className = 'product-card';
            tarjeta.style.cssText = 'background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 8px; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem; transition: transform 0.2s;';

            // Color de etiqueta según gama
            let colorGamaBadge = 'var(--economica)';
            if (material.gama === 'media') colorGamaBadge = 'var(--media)';
            if (material.gama === 'premium') colorGamaBadge = 'var(--premium)';

            tarjeta.innerHTML = `
                <div style="position: relative; width: 100%; height: 110px; border-radius: 6px; overflow: hidden; background: #cbd5e1;">
                    <img src="${material.imagen}" alt="${material.nombre}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='${material.imagenRespaldo}'">
                    <span style="position: absolute; top: 6px; right: 6px; background-color: ${colorGamaBadge}; color: white; font-size: 0.65rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">
                        ${material.gama}
                    </span>
                </div>
                <div style="font-size: 0.8rem; font-weight: 600; color: var(--text-primary); line-height: 1.2; height: 2.4em; overflow: hidden;">
                    ${material.nombre}
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: auto;">
                    <span style="font-size: 0.85rem; font-weight: 700; color: var(--accent-color);">
                        ${formatearMoneda(material.precioUnitario)} <small style="font-size: 0.65rem; color: var(--text-secondary);">/ ${material.unidad}</small>
                    </span>
                </div>
                <button class="btn-usar-material" data-id="${material.id}" style="background-color: var(--accent-color); color: white; border: none; padding: 0.4rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600; cursor: pointer; transition: background 0.2s;">
                    <i class="fa-solid fa-paintbrush"></i> Usar como pincel
                </button>
            `;

            // Escucha para preparar el material como pincel.
            const botonUsar = tarjeta.querySelector('.btn-usar-material');
            botonUsar.addEventListener('click', () => {
                this.aplicarMaterialASeleccion(material);
            });

            contenedorLista.appendChild(tarjeta);
        });
    }

    /**
     * Aplica el material al elemento activo y lo prepara para dibujar con el pincel.
     * @param {Object} material 
     */
    aplicarMaterialASeleccion(material) {
        this.materialSeleccionadoActivo = material;
        
        if (window.appElementoSeleccionado) {
            window.appElementoSeleccionado.material = { ...material };
            
            // Actualizar color de la malla 3D al instante
            if (window.appElementoSeleccionado.malla && window.appElementoSeleccionado.malla.material) {
                const materiales = Array.isArray(window.appElementoSeleccionado.malla.material)
                    ? window.appElementoSeleccionado.malla.material
                    : [window.appElementoSeleccionado.malla.material];
                materiales.forEach(material3D => {
                    material3D.color.set(material.color || '#3b82f6');
                    material3D.needsUpdate = true;
                });
            }

            mostrarNotificacion(`Material aplicado: ${material.nombre}`, 'success');

            if (this.callbackActualizarPresupuesto) {
                this.callbackActualizarPresupuesto();
            }
        } else {
            mostrarNotificacion(`Material listo para dibujar: ${material.nombre}.`, 'info');
        }

        if (this.callbackActivarPincel) {
            this.callbackActivarPincel(material);
        }
    }
}