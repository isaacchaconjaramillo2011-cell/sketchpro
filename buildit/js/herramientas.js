/**
 * /js/herramientas.js
 * Herramientas interactivas de dibujo y selección (muro, piso, puerta, ventana, medir, borrar).
 */

import { LISTA_MATERIALES } from './materiales-datos.js';
import { mostrarNotificacion } from './utilidades.js';

export class HerramientasDibujo {
    /**
     * @param {Object} escena3d - Instancia de la clase Escena3D.
     * @param {Object} gestorElementos - Instancia de la clase GestorElementos.
     * @param {Object} callbacks - Funciones de retorno para actualizar UI (ej: al seleccionar elemento).
     */
    constructor(escena3d, gestorElementos, callbacks = {}) {
        if (!escena3d || !gestorElementos) {
            throw new Error("Se requieren las instancias de Escena3D y GestorElementos.");
        }

        this.escena3d = escena3d;
        this.gestorElementos = gestorElementos;
        this.callbacks = callbacks;

        this.herramientaActiva = 'seleccionar';
        this.estadoDibujo = 0; // 0: Reposo, 1: Primer punto fijado
        this.puntoTemporal = null;
        this.elementoSeleccionado = null;
        this.materialActivo = null;
        this.formaDibujo = 'linea';
        this.verticesDibujo = [];
        this.ejePincel = null;
        this.previsualizacionPincel = null;
        this.marcadorPuntaMuro = null;
        this.ultimaCoordenadaSuelo = null;
        this.inicioPanPuntero = null;
        this.ignorarClickTrasPan = false;
        this.arrastreElemento = null;

        // Raycaster de Three.js para detección de clics en el 3D
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.inicializarEventosRaton();
        this.inicializarEventosTeclado();
    }

    /**
     * Cambia la herramienta activa actual.
     * @param {string} nuevaHerramienta 
     */
    setHerramienta(nuevaHerramienta) {
        this.limpiarPrevisualizacionPincel();
        this.ocultarMarcadorPuntaMuro();
        this.herramientaActiva = nuevaHerramienta;
        this.estadoDibujo = 0;
        this.puntoTemporal = null;
        this.verticesDibujo = [];
        this.ejePincel = null;
        this.formaDibujo = nuevaHerramienta === 'piso'
            || nuevaHerramienta === 'pincel' && this.materialActivo && this.materialActivo.categoria === 'Pisos'
            ? 'poligono'
            : 'linea';
        const herramientaDibujoActiva = ['pincel', 'muro', 'piso'].includes(nuevaHerramienta);
        this.escena3d.setInteraccionPincelActiva(herramientaDibujoActiva);
        this.escena3d.renderizador.domElement.style.cursor = herramientaDibujoActiva ? 'crosshair' : 'default';
        this.actualizarAyudaContextual();
    }

    setMaterialPincel(material) {
        this.limpiarPrevisualizacionPincel();
        this.ocultarMarcadorPuntaMuro();
        this.materialActivo = material;
        this.formaDibujo = material && material.categoria === 'Pisos' ? 'poligono' : 'linea';
        this.actualizarAyudaContextual();
    }

    setFormaDibujo(forma) {
        if (!['linea', 'poligono', 'rectangulo', 'circulo'].includes(forma)) {
            throw new Error(`La forma de dibujo "${forma}" no es válida.`);
        }
        this.limpiarPrevisualizacionPincel();
        this.formaDibujo = forma;
        this.estadoDibujo = 0;
        this.puntoTemporal = null;
        this.verticesDibujo = [];
        this.ejePincel = null;
        this.actualizarAyudaContextual();
    }

    generarVerticesForma(inicio, fin, forma) {
        if (forma === 'circulo') {
            const radio = Math.hypot(fin.x - inicio.x, fin.z - inicio.z);
            return Array.from({ length: 32 }, (_, indice) => {
                const angulo = (indice / 32) * Math.PI * 2;
                return {
                    x: inicio.x + Math.cos(angulo) * radio,
                    z: inicio.z + Math.sin(angulo) * radio
                };
            });
        }
        return [
            { x: inicio.x, z: inicio.z },
            { x: fin.x, z: inicio.z },
            { x: fin.x, z: fin.z },
            { x: inicio.x, z: fin.z }
        ];
    }

    /**
     * Configura los监听 de eventos de mouse (mousemove, mousedown, click).
     */
    inicializarEventosRaton() {
        const domElemento = this.escena3d.renderizador.domElement;

        domElemento.addEventListener('pointerdown', (evento) => {
            if (this.herramientaActiva === 'seleccionar' && evento.button === 0) {
                const elemento = this.obtenerElementoBajoPuntero(evento);
                const interseccion = elemento
                    ? this.raycaster.intersectObject(elemento.malla, false)[0]
                    : null;

                if (elemento) {
                    this.seleccionarElemento(elemento);
                    const nivel = elemento.nivel || 0;
                    const planoMovimiento = new THREE.Plane(
                        new THREE.Vector3(0, 1, 0),
                        -(this.escena3d.modo2D ? nivel * 3 : interseccion ? interseccion.point.y : nivel * 3)
                    );
                    const puntoInicio = this.raycaster.ray.intersectPlane(planoMovimiento, new THREE.Vector3());
                    if (puntoInicio) {
                        this.arrastreElemento = {
                            elemento,
                            planoMovimiento,
                            puntoInicio,
                            ultimaDelta: { x: 0, z: 0 },
                            mallas: elemento.tipo === 'muro'
                                ? [elemento, ...elemento.aberturas].map(item => item.malla).filter(Boolean)
                                : [elemento.malla],
                            posicionesIniciales: (elemento.tipo === 'muro'
                                ? [elemento, ...elemento.aberturas].map(item => item.malla).filter(Boolean)
                                : [elemento.malla]
                            ).map(malla => malla.position.clone())
                        };
                        domElemento.setPointerCapture(evento.pointerId);
                        evento.preventDefault();
                        evento.stopImmediatePropagation();
                        this.inicioPanPuntero = null;
                        return;
                    }
                } else {
                    this.seleccionarElemento(null);
                }
            }

            this.inicioPanPuntero = this.escena3d.modo2D
                && this.herramientaActiva === 'seleccionar'
                && evento.button === 0
                ? { x: evento.clientX, y: evento.clientY }
                : null;
        }, true);

        domElemento.addEventListener('pointermove', (evento) => {
            if (!this.arrastreElemento) return;
            this.actualizarCoordenadasMouse(evento);
            this.raycaster.setFromCamera(this.mouse, this.escena3d.camara);
            const puntoActual = this.raycaster.ray.intersectPlane(
                this.arrastreElemento.planoMovimiento,
                new THREE.Vector3()
            );
            if (!puntoActual) return;

            const deltaX = puntoActual.x - this.arrastreElemento.puntoInicio.x;
            const deltaZ = puntoActual.z - this.arrastreElemento.puntoInicio.z;
            const incrementoX = deltaX - this.arrastreElemento.ultimaDelta.x;
            const incrementoZ = deltaZ - this.arrastreElemento.ultimaDelta.z;
            this.arrastreElemento.mallas.forEach(malla => {
                malla.position.x += incrementoX;
                malla.position.z += incrementoZ;
            });
            this.arrastreElemento.ultimaDelta = { x: deltaX, z: deltaZ };
            if (Math.hypot(deltaX, deltaZ) > 0.02) {
                this.arrastreElemento.movido = true;
            }
        }, true);

        domElemento.addEventListener('pointerup', (evento) => {
            if (this.arrastreElemento) {
                const { elemento, ultimaDelta, movido } = this.arrastreElemento;
                this.arrastreElemento = null;
                if (movido) {
                    this.aplicarDesplazamientoModelo(elemento, ultimaDelta.x, ultimaDelta.z);
                    if (this.callbacks.onElementoMovido) {
                        this.callbacks.onElementoMovido(elemento.id);
                    }
                }
                this.ignorarClickTrasPan = true;
                window.setTimeout(() => {
                    this.ignorarClickTrasPan = false;
                }, 0);
                return;
            }
            if (!this.inicioPanPuntero) return;
            const distancia = Math.hypot(
                evento.clientX - this.inicioPanPuntero.x,
                evento.clientY - this.inicioPanPuntero.y
            );
            this.inicioPanPuntero = null;
            if (distancia > 5) {
                this.ignorarClickTrasPan = true;
                window.setTimeout(() => {
                    this.ignorarClickTrasPan = false;
                }, 0);
            }
        });

        domElemento.addEventListener('pointercancel', () => {
            this.inicioPanPuntero = null;
            if (this.arrastreElemento) {
                this.arrastreElemento.mallas.forEach((malla, indice) => {
                    malla.position.copy(this.arrastreElemento.posicionesIniciales[indice]);
                });
            }
            this.arrastreElemento = null;
        });

        domElemento.addEventListener('mousemove', (evento) => {
            this.actualizarCoordenadasMouse(evento);
            this.manejarMovimientoMouse();
        });

        domElemento.addEventListener('click', (evento) => {
            if (this.ignorarClickTrasPan) {
                this.ignorarClickTrasPan = false;
                return;
            }
            this.actualizarCoordenadasMouse(evento);
            this.manejarClicMouse(evento);
        });
    }

    aplicarDesplazamientoModelo(elemento, deltaX, deltaZ) {
        if (elemento.tipo === 'muro') {
            elemento.p1.x += deltaX;
            elemento.p1.z += deltaZ;
            elemento.p2.x += deltaX;
            elemento.p2.z += deltaZ;
            return;
        }

        if (elemento.tipo === 'puerta' || elemento.tipo === 'ventana') {
            const muro = this.gestorElementos.elementosModelo.find(item =>
                item.tipo === 'muro' && item.aberturas.includes(elemento)
            );
            if (!muro) return;
            const dx = muro.p2.x - muro.p1.x;
            const dz = muro.p2.z - muro.p1.z;
            const longitud = Math.hypot(dx, dz);
            const longitudCuadrada = longitud * longitud;
            if (!longitudCuadrada) return;
            if (elemento.ancho > longitud) {
                mostrarNotificacion('La abertura seleccionada es más ancha que el muro.', 'error');
                elemento.malla.position.x -= deltaX;
                elemento.malla.position.z -= deltaZ;
                return;
            }
            const posicionX = elemento.malla.position.x;
            const posicionZ = elemento.malla.position.z;
            const desplazamientoMinimo = elemento.ancho / (2 * longitud);
            elemento.posicionRelativa = Math.max(
                desplazamientoMinimo,
                Math.min(
                    1 - desplazamientoMinimo,
                    ((posicionX - muro.p1.x) * dx + (posicionZ - muro.p1.z) * dz) / longitudCuadrada
                )
            );
            elemento.malla.position.x = muro.p1.x + dx * elemento.posicionRelativa;
            elemento.malla.position.z = muro.p1.z + dz * elemento.posicionRelativa;
            return;
        }

        if (Array.isArray(elemento.vertices)) {
            elemento.vertices.forEach(vertice => {
                vertice.x += deltaX;
                vertice.z += deltaZ;
            });
            if (elemento.malla) {
                elemento.malla.position.x += deltaX;
                elemento.malla.position.z += deltaZ;
            }
        }
    }

    obtenerElementoBajoPuntero(evento) {
        this.actualizarCoordenadasMouse(evento);
        this.raycaster.setFromCamera(this.mouse, this.escena3d.camara);

        if (this.escena3d.modo2D) {
            const muroCercano = this.buscarMuroEnPlanta(evento);
            if (muroCercano) return muroCercano;
        }

        const mallasVisibles = this.gestorElementos.elementosModelo
            .filter(elemento => elemento.malla && elemento.malla.visible)
            .map(elemento => elemento.malla);
        const interseccion = this.raycaster.intersectObjects(mallasVisibles, false)[0];
        return interseccion
            ? this.gestorElementos.elementosModelo.find(elemento => elemento.malla === interseccion.object) || null
            : null;
    }

    buscarMuroEnPlanta(evento) {
        const canvas = this.escena3d.renderizador.domElement;
        const rectangulo = canvas.getBoundingClientRect();
        const selectorNivel = document.getElementById('nivel-select');
        const nivelActual = selectorNivel ? Number(selectorNivel.value) : 0;
        const tolerancia = 12;
        let distanciaMinima = tolerancia;
        let muroCercano = null;
        this.escena3d.camara.updateMatrixWorld();

        const distanciaPuntoSegmento = (punto, inicio, fin) => {
            const dx = fin.x - inicio.x;
            const dy = fin.y - inicio.y;
            const longitudCuadrada = dx * dx + dy * dy;
            if (!longitudCuadrada) return Math.hypot(punto.x - inicio.x, punto.y - inicio.y);
            const proyeccion = Math.max(0, Math.min(1,
                ((punto.x - inicio.x) * dx + (punto.y - inicio.y) * dy) / longitudCuadrada
            ));
            return Math.hypot(
                punto.x - (inicio.x + proyeccion * dx),
                punto.y - (inicio.y + proyeccion * dy)
            );
        };

        for (const elemento of this.gestorElementos.elementosModelo) {
            if (
                elemento.tipo !== 'muro'
                || !elemento.malla
                || !elemento.malla.visible
                || elemento.nivel !== nivelActual
            ) {
                continue;
            }

            const inicioNDC = new THREE.Vector3(elemento.p1.x, nivelActual * 3, elemento.p1.z)
                .project(this.escena3d.camara);
            const finNDC = new THREE.Vector3(elemento.p2.x, nivelActual * 3, elemento.p2.z)
                .project(this.escena3d.camara);
            if (
                inicioNDC.z < -1 || inicioNDC.z > 1
                || finNDC.z < -1 || finNDC.z > 1
            ) {
                continue;
            }

            const inicio = {
                x: rectangulo.left + ((inicioNDC.x + 1) / 2) * rectangulo.width,
                y: rectangulo.top + ((1 - inicioNDC.y) / 2) * rectangulo.height
            };
            const fin = {
                x: rectangulo.left + ((finNDC.x + 1) / 2) * rectangulo.width,
                y: rectangulo.top + ((1 - finNDC.y) / 2) * rectangulo.height
            };
            const distancia = distanciaPuntoSegmento(
                { x: evento.clientX, y: evento.clientY },
                inicio,
                fin
            );
            if (distancia <= distanciaMinima) {
                distanciaMinima = distancia;
                muroCercano = elemento;
            }
        }

        return muroCercano;
    }

    inicializarEventosTeclado() {
        window.addEventListener('keydown', (evento) => {
            const objetivo = evento.target;
            if (objetivo instanceof HTMLElement && objetivo.matches('input, textarea, select, [contenteditable="true"]')) {
                return;
            }

            if (
                this.estadoDibujo === 1
                && this.formaDibujo === 'poligono'
                && ['pincel', 'muro', 'piso'].includes(this.herramientaActiva)
            ) {
                if (evento.key === 'Enter') {
                    evento.preventDefault();
                    this.finalizarPoligono();
                    return;
                }
                if (evento.key === 'Escape') {
                    evento.preventDefault();
                    this.cancelarDibujo();
                    return;
                }
            }

            if (!['pincel', 'muro', 'piso'].includes(this.herramientaActiva)) return;
            if (evento.key === 'Escape') {
                evento.preventDefault();
                const botonSeleccionar = document.querySelector('.tool-btn[data-tool="seleccionar"]');
                if (botonSeleccionar) botonSeleccionar.click();
                else this.setHerramienta('seleccionar');
                return;
            }

            if (
                this.estadoDibujo !== 1
                || !this.materialActivo
                || this.materialActivo.categoria !== 'Muros'
                || evento.repeat
                || this.herramientaActiva === 'piso'
                || this.formaDibujo !== 'linea'
            ) {
                return;
            }

            let ejeSolicitado = null;
            if (evento.key === 'ArrowUp' || evento.key === 'ArrowDown') ejeSolicitado = 'z';
            if (evento.key === 'ArrowLeft' || evento.key === 'ArrowRight') ejeSolicitado = 'x';
            if (!ejeSolicitado) return;

            evento.preventDefault();
            this.ejePincel = ejeSolicitado;
            if (this.ultimaCoordenadaSuelo) {
                const puntoAjustado = this.ajustarAPuntaMuro(this.ultimaCoordenadaSuelo);
                this.actualizarPrevisualizacionPincel(this.obtenerPuntoPincel(puntoAjustado));
            }
            this.actualizarAyudaContextual();
        });
    }

    /**
     * Calcula la posición normalizada del mouse en el plano de la cámara.
     */
    actualizarCoordenadasMouse(evento) {
        const rect = this.escena3d.renderizador.domElement.getBoundingClientRect();
        this.mouse.x = ((evento.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((evento.clientY - rect.top) / rect.height) * 2 + 1;
    }

    /**
     * Obtiene la posición de intersección (x, z) en el plano del suelo con snap aplicado.
     */
    obtenerInterseccionSuelo() {
        this.raycaster.setFromCamera(this.mouse, this.escena3d.camara);
        const intersects = this.raycaster.intersectObject(this.escena3d.planoSuelo, false);

        for (let intersect of intersects) {
            if (intersect.object.name === "PlanoSuelo") {
                const xSnappeado = this.escena3d.aplicarSnap(intersect.point.x);
                const zSnappeado = this.escena3d.aplicarSnap(intersect.point.z);
                return { x: xSnappeado, y: 0, z: zSnappeado };
            }
        }
        return null;
    }

    /**
     * Actualiza el visor de coordenadas y ayuda contextual en la barra de estado.
     */
    actualizarAyudaContextual() {
        const helpEl = document.getElementById('context-help');
        if (!helpEl) return;

        switch (this.herramientaActiva) {
            case 'pincel':
                if (!this.materialActivo) {
                    helpEl.innerHTML = `<i class="fa-solid fa-circle-info"></i> Elige un material del catálogo para empezar a dibujar.`;
                    break;
                }
                const eje = this.ejePincel === 'x'
                    ? 'Eje X fijado. '
                    : this.ejePincel === 'z'
                        ? 'Eje Y del plano fijado. '
                        : '';
                helpEl.innerHTML = `<i class="fa-solid fa-paintbrush"></i> Pincel: <strong>${this.materialActivo.nombre}</strong>. ${eje}${this.obtenerAyudaPincel()}`;
                break;
            case 'muro':
                helpEl.innerHTML = `<i class="fa-solid fa-circle-info"></i> ${this.obtenerAyudaFormaDibujo('Muros')}`;
                break;
            case 'piso':
                helpEl.innerHTML = `<i class="fa-solid fa-circle-info"></i> ${this.obtenerAyudaFormaDibujo('Pisos')}`;
                break;
            case 'abertura':
                helpEl.innerHTML = `<i class="fa-solid fa-circle-info"></i> Haz clic sobre un muro para colocar ${this.obtenerTipoAbertura().replace('-', ' ')}.`;
                break;
            case 'borrar':
                helpEl.innerHTML = `<i class="fa-solid fa-circle-info"></i> Haz clic en cualquier elemento 3D para eliminarlo.`;
                break;
            case 'seleccionar':
            default:
                helpEl.innerHTML = `<i class="fa-solid fa-circle-info"></i> Haz clic en un elemento para ver sus propiedades.`;
                break;
        }
    }

    obtenerAyudaFormaDibujo(categoria) {
        if (this.formaDibujo === 'poligono') {
            return this.estadoDibujo === 0
                ? 'Haz clic en cada esquina y doble clic o pulsa Enter para cerrar el contorno.'
                : `${this.verticesDibujo.length} esquinas marcadas. Doble clic o Enter para cerrar; Escape para cancelar.`;
        }
        if (this.formaDibujo === 'circulo') {
            return this.estadoDibujo === 0
                ? `Haz clic para fijar el centro del ${categoria === 'Pisos' ? 'piso' : 'muro circular'}.`
                : 'Haz clic para fijar el radio.';
        }
        if (this.formaDibujo === 'rectangulo') {
            return this.estadoDibujo === 0
                ? `Haz clic en una esquina del ${categoria === 'Pisos' ? 'piso' : 'muro'}.`
                : 'Haz clic en la esquina opuesta para terminar.';
        }
        return this.estadoDibujo === 0
            ? 'Haz clic para colocar el inicio del muro.'
            : 'Haz clic para fijar el final del muro.';
    }

    /**
     * Maneja la lógica en tiempo real al mover el ratón.
     */
    manejarMovimientoMouse() {
        const coordsSuelo = this.obtenerInterseccionSuelo();
        if (!coordsSuelo) {
            this.ocultarMarcadorPuntaMuro();
            return;
        }
        this.ultimaCoordenadaSuelo = coordsSuelo;

        // Actualizar visor de coordenadas en UI
        const coordsDisplay = document.getElementById('coords-display');
        if (coordsDisplay) {
            coordsDisplay.textContent = `X: ${coordsSuelo.x.toFixed(2)}m | Z: ${coordsSuelo.z.toFixed(2)}m`;
        }

        // Mostrar la longitud en vivo mientras se traza un muro.
        if (this.herramientaActiva === 'muro' && this.estadoDibujo === 1 && this.puntoTemporal) {
            const dx = coordsSuelo.x - this.puntoTemporal.x;
            const dz = coordsSuelo.z - this.puntoTemporal.z;
            const longitudActual = Math.sqrt(dx * dx + dz * dz);
            
            const helpEl = document.getElementById('context-help');
            if (helpEl) {
                helpEl.innerHTML = `<i class="fa-solid fa-ruler"></i> Longitud del muro en vivo: <strong>${longitudActual.toFixed(2)}m</strong>. Haz clic para terminar.`;
            }
        }

        if (
            ['pincel', 'muro', 'piso'].includes(this.herramientaActiva)
            && this.estadoDibujo === 1
            && this.puntoTemporal
        ) {
            const puntoAjustado = this.ajustarAPuntaMuro(coordsSuelo);
            const puntoPincel = this.obtenerPuntoPincel(puntoAjustado);
            this.actualizarPrevisualizacionPincel(puntoPincel);
            const helpEl = document.getElementById('context-help');
            if (helpEl && (this.materialActivo || this.herramientaActiva !== 'pincel')) {
                const categoria = this.herramientaActiva === 'piso'
                    || this.materialActivo && this.materialActivo.categoria === 'Pisos'
                    ? 'Pisos'
                    : 'Muros';
                helpEl.innerHTML = `<i class="fa-solid fa-paintbrush"></i> ${this.obtenerAyudaFormaDibujo(categoria)}`;
            }
        } else if (['pincel', 'muro'].includes(this.herramientaActiva)) {
            this.ajustarAPuntaMuro(coordsSuelo);
        }
    }

    /**
     * Maneja la lógica al hacer clic izquierdo en el visor 3D.
     */
    manejarClicMouse(evento) {
        const coordsSuelo = this.obtenerInterseccionSuelo();

        switch (this.herramientaActiva) {
            case 'pincel':
                this.manejarPincel(coordsSuelo, false, evento);
                break;

            case 'muro':
                this.manejarPincel(coordsSuelo, false, evento, true);
                break;

            case 'seleccionar':
            case 'borrar':
                const elementoEncontrado = this.obtenerElementoBajoPuntero({
                    clientX: evento.clientX,
                    clientY: evento.clientY
                });
                if (elementoEncontrado) {
                    if (this.herramientaActiva === 'borrar') {
                        this.gestorElementos.eliminarElemento(elementoEncontrado.id);
                        if (this.callbacks.onElementoEliminado) {
                            this.callbacks.onElementoEliminado(elementoEncontrado.id);
                        }
                    } else {
                        this.seleccionarElemento(elementoEncontrado);
                    }
                }
                break;

            case 'abertura':
                this.colocarAbertura(evento, this.obtenerTipoAbertura());
                break;

            case 'piso':
                this.manejarPincel(coordsSuelo, true, evento);
                break;

            default:
                break;
        }
    }

    obtenerAyudaPincel() {
        if (!this.materialActivo) return 'Elige un material del catálogo.';
        switch (this.materialActivo.categoria) {
            case 'Muros':
                return 'Haz clic en dos puntos. ↑/↓ fija Y; ←/→ fija X. En 2D, acércate a una punta existente para continuar desde ella.';
            case 'Pisos':
                return 'Haz clic en dos esquinas del plano para dibujar.';
            case 'Puertas':
            case 'Ventanas':
                return `Haz clic sobre un muro para colocar ${this.obtenerTipoAbertura(this.materialActivo.categoria).replace('-', ' ')}.`;
            default:
                return 'Este material no corresponde a un elemento que se pueda dibujar en el plano.';
        }
    }

    obtenerTipoAbertura(categoria = null) {
        const selector = document.getElementById('tipo-abertura');
        const seleccionado = selector ? selector.value : 'puerta';
        const tipoSeleccionado = seleccionado.startsWith('ventana-') ? 'Ventanas' : 'Puertas';
        if (!categoria || categoria === tipoSeleccionado) return seleccionado;
        return categoria === 'Ventanas' ? 'ventana-fija' : 'puerta';
    }

    obtenerMaterialAbertura(tipoAbertura) {
        const categoria = tipoAbertura.startsWith('ventana-') ? 'Ventanas' : 'Puertas';
        return this.materialActivo && this.materialActivo.categoria === categoria
            ? this.materialActivo
            : LISTA_MATERIALES.find(material => material.categoria === categoria) || null;
    }

    colocarAbertura(evento, tipoAbertura) {
        const muro = this.obtenerElementoBajoPuntero(evento);
        if (!muro || muro.tipo !== 'muro') return;

        this.raycaster.setFromCamera(this.mouse, this.escena3d.camara);
        const interseccion = this.raycaster.intersectObject(muro.malla, false)[0];
        const plano = new THREE.Plane(
            new THREE.Vector3(0, 1, 0),
            -(muro.nivel * 3)
        );
        const punto = interseccion
            ? interseccion.point
            : this.raycaster.ray.intersectPlane(plano, new THREE.Vector3());
        if (!punto) return;

        const dx = muro.p2.x - muro.p1.x;
        const dz = muro.p2.z - muro.p1.z;
        const longitudCuadrada = dx * dx + dz * dz;
        if (!longitudCuadrada) return;
        const posicionRelativa = Math.max(0, Math.min(1,
            ((punto.x - muro.p1.x) * dx + (punto.z - muro.p1.z) * dz) / longitudCuadrada
        ));
        const abertura = this.gestorElementos.crearAberturaEnMuro(
            muro,
            tipoAbertura,
            posicionRelativa,
            this.obtenerMaterialAbertura(tipoAbertura)
        );
        if (abertura) this.notificarCambioModelo();
    }

    manejarPincel(coordsSuelo, dibujarPiso = false, evento = null, dibujarMuro = false) {
        const materialActivo = dibujarPiso
            ? (this.materialActivo && this.materialActivo.categoria === 'Pisos'
                ? this.materialActivo
                : LISTA_MATERIALES.find(material => material.categoria === 'Pisos') || null)
            : this.materialActivo;
        if (!materialActivo && !dibujarMuro) {
            this.actualizarAyudaContextual();
            return;
        }

        const categoria = dibujarMuro ? 'Muros' : dibujarPiso ? 'Pisos' : materialActivo.categoria;
        if (categoria === 'Puertas' || categoria === 'Ventanas') {
            this.colocarAbertura(
                { clientX: ((this.mouse.x + 1) / 2) * this.escena3d.renderizador.domElement.clientWidth
                    + this.escena3d.renderizador.domElement.getBoundingClientRect().left,
                clientY: ((1 - this.mouse.y) / 2) * this.escena3d.renderizador.domElement.clientHeight
                    + this.escena3d.renderizador.domElement.getBoundingClientRect().top },
                this.obtenerTipoAbertura(categoria)
            );
            return;
        }
        if (!['Muros', 'Pisos'].includes(categoria)) {
            this.actualizarAyudaContextual();
            return;
        }
        if (!coordsSuelo) return;

        const forma = categoria === 'Pisos' && this.formaDibujo === 'linea'
            ? 'poligono'
            : this.formaDibujo;
        const punto = this.ajustarAPuntaMuro(coordsSuelo);
        if (forma === 'poligono') {
            if (!this.estadoDibujo) {
                this.puntoTemporal = { ...punto };
                this.verticesDibujo = [{ x: punto.x, z: punto.z }];
                this.estadoDibujo = 1;
                this.crearPrevisualizacionPincel(materialActivo);
            } else if (Math.hypot(
                punto.x - this.verticesDibujo[this.verticesDibujo.length - 1].x,
                punto.z - this.verticesDibujo[this.verticesDibujo.length - 1].z
            ) > 0.01) {
                this.verticesDibujo.push({ x: punto.x, z: punto.z });
            }

            this.actualizarPrevisualizacionPincel(punto);
            if (evento && evento.detail >= 2) this.finalizarPoligono(materialActivo, categoria);
            else this.actualizarAyudaContextual();
            return;
        }

        if (!this.estadoDibujo) {
            this.puntoTemporal = { x: punto.x, z: punto.z };
            this.estadoDibujo = 1;
            this.ultimaCoordenadaSuelo = punto;
            this.crearPrevisualizacionPincel(materialActivo);
            this.actualizarPrevisualizacionPincel(punto);
            this.actualizarAyudaContextual();
            return;
        }

        const inicio = this.puntoTemporal;
        const fin = this.obtenerPuntoPincel(punto);
        const nivelSelect = document.getElementById('nivel-select');
        const nivel = nivelSelect ? Number(nivelSelect.value) : 0;
        let elementosCreados = [];
        if (categoria === 'Pisos') {
            const vertices = forma === 'linea'
                ? this.generarVerticesForma(inicio, fin, 'rectangulo')
                : this.generarVerticesForma(inicio, fin, forma);
            const piso = this.gestorElementos.crearPiso(vertices, 0.2, materialActivo, nivel);
            if (piso) elementosCreados.push(piso);
        } else if (forma === 'linea') {
            const muro = this.gestorElementos.crearMuro(inicio, fin, 2.8, 0.15, materialActivo, nivel);
            if (muro) elementosCreados.push(muro);
        } else {
            elementosCreados = this.crearMurosDesdeVertices(
                this.generarVerticesForma(inicio, fin, forma),
                materialActivo,
                nivel
            );
        }

        this.completarDibujo(elementosCreados);
    }

    finalizarPoligono(materialActivo = null, categoria = null) {
        if (!this.verticesDibujo.length) return;
        if (!categoria) {
            const dibujarPiso = this.herramientaActiva === 'piso'
                || this.materialActivo && this.materialActivo.categoria === 'Pisos';
            categoria = dibujarPiso ? 'Pisos' : 'Muros';
            materialActivo = dibujarPiso
                ? (this.materialActivo && this.materialActivo.categoria === 'Pisos'
                    ? this.materialActivo
                    : LISTA_MATERIALES.find(material => material.categoria === 'Pisos') || null)
                : this.materialActivo;
        }

        const vertices = this.verticesDibujo.map(punto => ({ ...punto }));
        if (vertices.length > 2 && Math.hypot(
            vertices[0].x - vertices[vertices.length - 1].x,
            vertices[0].z - vertices[vertices.length - 1].z
        ) <= 0.01) {
            vertices.pop();
        }
        if (vertices.length < 3) {
            mostrarNotificacion('Marca al menos tres esquinas para cerrar el piso.', 'error');
            this.actualizarAyudaContextual();
            return;
        }

        const nivelSelect = document.getElementById('nivel-select');
        const nivel = nivelSelect ? Number(nivelSelect.value) : 0;
        const elementosCreados = categoria === 'Pisos'
            ? [this.gestorElementos.crearPiso(vertices, 0.2, materialActivo, nivel)].filter(Boolean)
            : this.crearMurosDesdeVertices(vertices, materialActivo, nivel);
        this.completarDibujo(elementosCreados);
    }

    crearMurosDesdeVertices(vertices, materialActivo, nivel) {
        const creados = [];
        for (let indice = 0; indice < vertices.length; indice += 1) {
            const inicio = vertices[indice];
            const fin = vertices[(indice + 1) % vertices.length];
            const muro = this.gestorElementos.crearMuro(
                inicio,
                fin,
                2.8,
                0.15,
                materialActivo,
                nivel
            );
            if (!muro) {
                creados.forEach(elemento => this.gestorElementos.eliminarElemento(elemento.id));
                mostrarNotificacion('No se pudo completar el contorno de muros.', 'error');
                return [];
            }
            creados.push(muro);
        }
        return creados;
    }

    completarDibujo(elementosCreados) {
        if (elementosCreados.length) {
            this.seleccionarElemento(elementosCreados[0]);
            this.notificarCambioModelo();
        }
        this.limpiarPrevisualizacionPincel();
        this.estadoDibujo = 0;
        this.puntoTemporal = null;
        this.verticesDibujo = [];
        this.ejePincel = null;
        this.ocultarMarcadorPuntaMuro();
        this.actualizarAyudaContextual();
    }

    cancelarDibujo() {
        this.limpiarPrevisualizacionPincel();
        this.estadoDibujo = 0;
        this.puntoTemporal = null;
        this.verticesDibujo = [];
        this.ejePincel = null;
        this.actualizarAyudaContextual();
    }

    ajustarAPuntaMuro(coords) {
        const nivelSelect = document.getElementById('nivel-select');
        const nivel = nivelSelect ? Number(nivelSelect.value) : 0;
        if (
            !this.escena3d.modo2D
            || this.herramientaActiva !== 'pincel'
            || !this.materialActivo
            || this.materialActivo.categoria !== 'Muros'
        ) {
            this.ocultarMarcadorPuntaMuro();
            return coords;
        }

        const lienzo = this.escena3d.renderizador.domElement;
        const rectangulo = lienzo.getBoundingClientRect();
        if (!rectangulo.width || !rectangulo.height) {
            this.ocultarMarcadorPuntaMuro();
            return coords;
        }
        let puntoCercano = null;
        let distanciaMinima = 14;

        for (const elemento of this.gestorElementos.elementosModelo) {
            if (elemento.tipo !== 'muro' || elemento.nivel !== nivel) continue;

            for (const punto of [elemento.p1, elemento.p2]) {
                if (
                    this.puntoTemporal
                    && ((this.ejePincel === 'z' && Math.abs(punto.x - this.puntoTemporal.x) > 0.001)
                        || (this.ejePincel === 'x' && Math.abs(punto.z - this.puntoTemporal.z) > 0.001))
                ) {
                    continue;
                }
                const posicionPantalla = new THREE.Vector3(punto.x, nivel * 3, punto.z)
                    .project(this.escena3d.camara);
                if (posicionPantalla.z < -1 || posicionPantalla.z > 1) continue;

                const x = ((posicionPantalla.x + 1) / 2) * rectangulo.width;
                const y = ((1 - posicionPantalla.y) / 2) * rectangulo.height;
                const mouseX = ((this.mouse.x + 1) / 2) * rectangulo.width;
                const mouseY = ((1 - this.mouse.y) / 2) * rectangulo.height;
                const distancia = Math.hypot(x - mouseX, y - mouseY);
                if (distancia <= distanciaMinima) {
                    distanciaMinima = distancia;
                    puntoCercano = punto;
                }
            }
        }

        this.mostrarMarcadorPuntaMuro(puntoCercano, nivel);
        return puntoCercano ? { ...puntoCercano, y: 0 } : coords;
    }

    mostrarMarcadorPuntaMuro(punto, nivel) {
        if (!punto) {
            this.ocultarMarcadorPuntaMuro();
            return;
        }
        if (!this.marcadorPuntaMuro) {
            const geometria = new THREE.SphereGeometry(0.12, 12, 8);
            const material = new THREE.MeshBasicMaterial({
                color: '#2563eb',
                depthTest: false
            });
            this.marcadorPuntaMuro = new THREE.Mesh(geometria, material);
            this.marcadorPuntaMuro.name = 'MarcadorPuntaMuro';
            this.marcadorPuntaMuro.renderOrder = 11;
            this.escena3d.escena.add(this.marcadorPuntaMuro);
        }
        this.marcadorPuntaMuro.position.set(punto.x, 0.12 + nivel * 3, punto.z);
        this.marcadorPuntaMuro.visible = true;
    }

    ocultarMarcadorPuntaMuro() {
        if (this.marcadorPuntaMuro) this.marcadorPuntaMuro.visible = false;
    }

    obtenerPuntoPincel(coords) {
        if (this.materialActivo && this.materialActivo.categoria === 'Muros' && this.puntoTemporal) {
            if (this.ejePincel === 'x') return { ...coords, z: this.puntoTemporal.z };
            if (this.ejePincel === 'z') return { ...coords, x: this.puntoTemporal.x };
        }
        return coords;
    }

    crearPrevisualizacionPincel(materialDibujo = this.materialActivo) {
        this.limpiarPrevisualizacionPincel();
        const esMuro = this.herramientaActiva === 'muro';
        const esPiso = this.herramientaActiva === 'piso'
            || materialDibujo && materialDibujo.categoria === 'Pisos';
        if ((!materialDibujo && !esPiso && !esMuro) || !this.puntoTemporal) return;

        const nivelSelect = document.getElementById('nivel-select');
        const alturaPlano = (nivelSelect ? Number(nivelSelect.value) : 0) * 3 + 0.04;
        const geometria = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(this.puntoTemporal.x, alturaPlano, this.puntoTemporal.z),
            new THREE.Vector3(this.puntoTemporal.x, alturaPlano, this.puntoTemporal.z)
        ]);
        const color = materialDibujo && materialDibujo.color || '#3b82f6';
        const material = new THREE.LineBasicMaterial({
            color: new THREE.Color(color),
            transparent: true,
            opacity: 0.95,
            depthTest: false
        });

        this.previsualizacionPincel = new THREE.Line(geometria, material);
        this.previsualizacionPincel.renderOrder = 10;
        this.escena3d.escena.add(this.previsualizacionPincel);
    }

    actualizarPrevisualizacionPincel(puntoFinal) {
        if (!this.previsualizacionPincel || !this.puntoTemporal) return;

        const nivelSelect = document.getElementById('nivel-select');
        const y = (nivelSelect ? Number(nivelSelect.value) : 0) * 3 + 0.04;
        let puntosPlanta;
        const esPiso = this.herramientaActiva === 'piso'
            || this.materialActivo && this.materialActivo.categoria === 'Pisos';
        const forma = esPiso && this.formaDibujo === 'linea' ? 'poligono' : this.formaDibujo;
        if (forma === 'poligono') {
            puntosPlanta = this.verticesDibujo.map(punto => ({ ...punto }));
            const ultimo = puntosPlanta[puntosPlanta.length - 1];
            if (!ultimo || Math.hypot(puntoFinal.x - ultimo.x, puntoFinal.z - ultimo.z) > 0.01) {
                puntosPlanta.push({ x: puntoFinal.x, z: puntoFinal.z });
            }
            if (puntosPlanta.length > 2) puntosPlanta.push(puntosPlanta[0]);
        } else if (forma === 'rectangulo' || forma === 'circulo') {
            puntosPlanta = this.generarVerticesForma(this.puntoTemporal, puntoFinal, forma);
            puntosPlanta.push(puntosPlanta[0]);
        } else {
            puntosPlanta = [this.puntoTemporal, puntoFinal];
        }
        const puntos = puntosPlanta.map(punto => new THREE.Vector3(punto.x, y, punto.z));

        this.previsualizacionPincel.geometry.setFromPoints(puntos);
        this.previsualizacionPincel.geometry.computeBoundingSphere();
    }

    limpiarPrevisualizacionPincel() {
        if (!this.previsualizacionPincel) return;
        this.escena3d.escena.remove(this.previsualizacionPincel);
        this.previsualizacionPincel.geometry.dispose();
        this.previsualizacionPincel.material.dispose();
        this.previsualizacionPincel = null;
    }

    notificarCambioModelo() {
        if (this.callbacks.onPresupuestoActualizado) {
            this.callbacks.onPresupuestoActualizado();
        }
    }

    /**
     * Selecciona un elemento y dispara callback para actualizar el panel de propiedades.
     * @param {Object} elemento 
     */
    seleccionarElemento(elemento) {
        const materialAnterior = this.elementoSeleccionado && this.elementoSeleccionado.malla
            ? this.elementoSeleccionado.malla.material
            : null;
        const materialesAnteriores = Array.isArray(materialAnterior) ? materialAnterior : [materialAnterior];
        materialesAnteriores.forEach(material => this.restaurarMaterialSeleccionado(material));

        this.elementoSeleccionado = elemento;
        if (elemento && elemento.malla && Array.isArray(elemento.malla.material)) {
            elemento.malla.material.forEach(material => this.resaltarMaterialSeleccionado(material));
        } else if (elemento && elemento.malla) {
            this.resaltarMaterialSeleccionado(elemento.malla.material);
        }
        if (this.callbacks.onElementoSeleccionado) {
            this.callbacks.onElementoSeleccionado(elemento);
        }
    }

    restaurarMaterialSeleccionado(material) {
        if (!material || !material.emissive || material.userData.colorSeleccionOriginal === undefined) return;
        material.emissive.setHex(material.userData.colorSeleccionOriginal);
        material.emissiveIntensity = material.userData.intensidadSeleccionOriginal;
        delete material.userData.colorSeleccionOriginal;
        delete material.userData.intensidadSeleccionOriginal;
    }

    resaltarMaterialSeleccionado(material) {
        if (!material || !material.emissive) return;
        if (material.userData.colorSeleccionOriginal === undefined) {
            material.userData.colorSeleccionOriginal = material.emissive.getHex();
            material.userData.intensidadSeleccionOriginal = material.emissiveIntensity;
        }
        material.emissive.set('#2563eb');
        material.emissiveIntensity = 0.22;
    }
}