/**
 * /js/main.js
 * Punto de arranque de SketchPlus. Conecta todos los módulos y gestiona la interfaz global.
 */

import { Escena3D } from './escena.js';
import { GestorElementos } from './elementos.js';
import { HerramientasDibujo } from './herramientas.js';
import { CalculadoraPresupuesto } from './calculadora.js';
import { UICatalogo } from './ui-catalogo.js';
import { UIPresupuesto } from './ui-presupuesto.js';
import { AlmacenamientoProyecto } from './almacenamiento.js';
import { LISTA_MATERIALES } from './materiales-datos.js';
import { generarIdUnico, mostrarNotificacion } from './utilidades.js';

const PLANTILLAS_CASA = {
    compacta: {
        materialMuro: 'muro-ladrillo-comun',
        materialPiso: 'piso-ceramica-basica',
        paredes: [
            [[-3, -4], [3, -4], 'ventana'],
            [[3, -4], [3, 4], 'ventana'],
            [[3, 4], [-3, 4], 'ventana'],
            [[-3, 4], [-3, -4], 'puerta'],
            [[0, -4], [0, 4], 'puerta'],
            [[-3, 0], [0, 0], 'puerta']
        ],
        vertices: [[-3, -4], [3, -4], [3, 4], [-3, 4]]
    },
    familiar: {
        materialMuro: 'muro-bloque-concreto-n10',
        materialPiso: 'piso-ceramica-basica',
        paredes: [
            [[-4, -5], [4, -5], 'ventana'],
            [[4, -5], [4, 5], 'ventana'],
            [[4, 5], [-4, 5], 'ventana'],
            [[-4, 5], [-4, -5], 'puerta'],
            [[0, -5], [0, 5], 'puerta'],
            [[-4, 0], [0, 0], 'puerta'],
            [[0, -1], [4, -1], 'puerta']
        ],
        vertices: [[-4, -5], [4, -5], [4, 5], [-4, 5]]
    },
    amplia: {
        materialMuro: 'muro-bloque-concreto-n15',
        materialPiso: 'piso-porcelanato-pulido',
        paredes: [
            [[-5, -6], [5, -6], 'ventana'],
            [[5, -6], [5, 6], 'ventana'],
            [[5, 6], [-5, 6], 'ventana'],
            [[-5, 6], [-5, -6], 'puerta'],
            [[-1.5, -6], [-1.5, 6], 'puerta'],
            [[-5, 1], [-1.5, 1], 'puerta'],
            [[-1.5, -2], [5, -2], 'puerta'],
            [[1.5, -6], [1.5, -2], 'puerta']
        ],
        vertices: [[-5, -6], [5, -6], [5, 6], [-5, 6]]
    }
};

function asegurarPisosAutomaticos(gestorElementos, cantidadNiveles) {
    const materialPiso = LISTA_MATERIALES.find(material => material.categoria === 'Pisos');
    if (!materialPiso) throw new Error('No hay un material de piso disponible para cerrar las habitaciones.');

    const pisosCreados = [];
    for (let nivel = 0; nivel < cantidadNiveles; nivel += 1) {
        pisosCreados.push(...gestorElementos.crearPisosEnHabitaciones(materialPiso, nivel));
    }
    return pisosCreados;
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log("Inicializando SketchPlus...");

        // 1. Contenedor del visor 3D
        const contenedorCanvas = document.getElementById('canvas-target');
        if (!contenedorCanvas) {
            throw new Error("No se encontró el contenedor #canvas-target en el DOM.");
        }

        // 2. Inicializar módulos principales
        const escena3d = new Escena3D(contenedorCanvas);
        const gestorElementos = new GestorElementos(escena3d.escena);
        const almacenamiento = new AlmacenamientoProyecto(gestorElementos);
        let cantidadNiveles = 2;
        const proyectoGuardado = almacenamiento.cargarProyectoLocal();
        if (proyectoGuardado) cantidadNiveles = proyectoGuardado.niveles;

        const calculadora = new CalculadoraPresupuesto(gestorElementos.elementosModelo);
        
        // Exponer elemento seleccionado globalmente para el catálogo
        window.appElementoSeleccionado = null;

        // 3. Inicializar paneles de UI
        let uiPresupuesto = null;
        const botonUndo = document.getElementById('btn-undo');
        const botonRedo = document.getElementById('btn-redo');
        const selectorNivel = document.getElementById('nivel-select');
        let nivelActual = 0;
        const historialUndo = [];
        const historialRedo = [];

        const crearEstadoProyecto = () => ({
            elementos: gestorElementos.crearInstantanea(),
            niveles: cantidadNiveles,
            nivelActual
        });
        let ultimaInstantanea = crearEstadoProyecto();

        const renderizarNiveles = () => {
            if (!selectorNivel) return;
            selectorNivel.innerHTML = '';
            for (let nivel = 0; nivel < cantidadNiveles; nivel += 1) {
                const opcion = document.createElement('option');
                opcion.value = String(nivel);
                opcion.textContent = nivel === 0 ? 'Planta Baja' : `Piso ${nivel}`;
                selectorNivel.appendChild(opcion);
            }
            nivelActual = Math.min(nivelActual, cantidadNiveles - 1);
            selectorNivel.value = String(nivelActual);
            gestorElementos.elementosModelo.forEach(elemento => {
                if (elemento.malla) elemento.malla.visible = elemento.nivel === nivelActual;
            });
            const ultimoNivel = document.getElementById('btn-quitar-piso');
            if (ultimoNivel) ultimoNivel.disabled = nivelActual === 0 || nivelActual !== cantidadNiveles - 1;
        };
        const sincronizarPisosAutomaticos = () => {
            asegurarPisosAutomaticos(gestorElementos, cantidadNiveles)
                .forEach(piso => { piso.malla.visible = piso.nivel === nivelActual; });
        };
        renderizarNiveles();
        sincronizarPisosAutomaticos();
        ultimaInstantanea = crearEstadoProyecto();

        const actualizarBotonesHistorial = () => {
            if (botonUndo) botonUndo.disabled = historialUndo.length === 0;
            if (botonRedo) botonRedo.disabled = historialRedo.length === 0;
        };

        const registrarCambioModelo = () => {
            const instantaneaActual = crearEstadoProyecto();
            if (JSON.stringify(instantaneaActual) === JSON.stringify(ultimaInstantanea)) return;
            historialUndo.push(ultimaInstantanea);
            historialRedo.length = 0;
            ultimaInstantanea = instantaneaActual;
            actualizarBotonesHistorial();
        };

        const actualizarInterfazModelo = () => {
            window.appElementoSeleccionado = null;
            renderizarPanelPropiedades(null);
            if (uiPresupuesto) uiPresupuesto.actualizarVistaPresupuesto();
            actualizarBotonesHistorial();
        };

        const restaurarEstadoProyecto = (estado) => {
            cantidadNiveles = estado.niveles;
            nivelActual = estado.nivelActual;
            gestorElementos.restaurarInstantanea(estado.elementos);
            renderizarNiveles();
            ultimaInstantanea = crearEstadoProyecto();
            actualizarInterfazModelo();
        };

        const deshacer = () => {
            if (!historialUndo.length) return;
            historialRedo.push(crearEstadoProyecto());
            const instantaneaAnterior = historialUndo.pop();
            restaurarEstadoProyecto(instantaneaAnterior);
        };

        const rehacer = () => {
            if (!historialRedo.length) return;
            historialUndo.push(crearEstadoProyecto());
            const instantaneaSiguiente = historialRedo.pop();
            restaurarEstadoProyecto(instantaneaSiguiente);
        };

        uiPresupuesto = UIPresupuesto
            ? new UIPresupuesto(calculadora, gestorElementos, {
                onAlternativaAplicada: cambios => {
                    const cambiosValidados = cambios.map(cambio => {
                        const elemento = gestorElementos.elementosModelo.find(item => item.id === cambio.idElemento);
                        if (!elemento) {
                            throw new Error(`No se encontró el elemento ${cambio.idElemento} para aplicar la alternativa.`);
                        }
                        return { elemento, material: cambio.materialPropuesto };
                    });
                    cambiosValidados.forEach(({ elemento, material }) => {
                        elemento.material = { ...material };
                        if (elemento.malla && elemento.malla.material && elemento.malla.material.color) {
                            elemento.malla.material.color.set(material.color || '#b2533e');
                        }
                    });
                    registrarCambioModelo();
                }
            })
            : null;

        const guardarProyecto = document.getElementById('btn-guardar-proyecto');
        if (guardarProyecto) {
            guardarProyecto.addEventListener('click', () => {
                almacenamiento.guardarProyectoLocal(cantidadNiveles);
            });
        }

        const botonAgregarPiso = document.getElementById('btn-agregar-piso');
        if (botonAgregarPiso) {
            botonAgregarPiso.addEventListener('click', () => {
                cantidadNiveles += 1;
                nivelActual = cantidadNiveles - 1;
                renderizarNiveles();
                registrarCambioModelo();
            });
        }

        const botonQuitarPiso = document.getElementById('btn-quitar-piso');
        if (botonQuitarPiso) {
            botonQuitarPiso.addEventListener('click', () => {
                if (nivelActual === 0 || nivelActual !== cantidadNiveles - 1) return;
                const nombrePiso = `Piso ${nivelActual}`;
                const tieneElementos = gestorElementos.elementosModelo.some(elemento => elemento.nivel === nivelActual);
                const confirmacion = tieneElementos
                    ? `¿Quitar ${nombrePiso} y todos sus elementos? Esta acción se puede deshacer.`
                    : `¿Quitar ${nombrePiso}?`;
                if (!window.confirm(confirmacion)) return;

                gestorElementos.elementosModelo
                    .filter(elemento => elemento.nivel === nivelActual && elemento.tipo !== 'puerta' && elemento.tipo !== 'ventana')
                    .map(elemento => elemento.id)
                    .forEach(id => gestorElementos.eliminarElemento(id));
                cantidadNiveles -= 1;
                nivelActual = cantidadNiveles - 1;
                renderizarNiveles();
                registrarCambioModelo();
                actualizarInterfazModelo();
            });
        }

        let planoGuia = null;
        let proporcionPlanoGuia = 1;
        if (selectorNivel) {
            selectorNivel.addEventListener('change', () => {
                nivelActual = Number(selectorNivel.value);
                renderizarNiveles();
                if (planoGuia) planoGuia.position.y = nivelActual * 3 + 0.025;
                ultimaInstantanea = crearEstadoProyecto();
            });
        }

        const botonImportarPlanoGuia = document.getElementById('btn-importar-plano-guia');
        const botonQuitarPlanoGuia = document.getElementById('btn-quitar-plano-guia');
        const inputPlanoGuia = document.getElementById('input-plano-guia');
        const controlesPlanoGuia = document.getElementById('plano-guia-controles');
        const controlAnchoPlanoGuia = document.getElementById('plano-guia-ancho');
        const valorAnchoPlanoGuia = document.getElementById('plano-guia-ancho-valor');
        const controlOpacidadPlanoGuia = document.getElementById('plano-guia-opacidad');
        const valorOpacidadPlanoGuia = document.getElementById('plano-guia-opacidad-valor');
        const actualizarEscalaPlanoGuia = () => {
            if (!planoGuia || !controlAnchoPlanoGuia) return;
            const anchoImagen = Number(controlAnchoPlanoGuia.value);
            const geometriaAnterior = planoGuia.geometry;
            planoGuia.geometry = new THREE.PlaneGeometry(anchoImagen, anchoImagen / proporcionPlanoGuia);
            geometriaAnterior.dispose();
            escena3d.tamañoVista2D = Math.max(anchoImagen, anchoImagen / proporcionPlanoGuia) * 0.75;
            if (escena3d.camara2D) {
                const aspect = contenedorCanvas.clientWidth / contenedorCanvas.clientHeight;
                escena3d.camara2D.left = -escena3d.tamañoVista2D * aspect;
                escena3d.camara2D.right = escena3d.tamañoVista2D * aspect;
                escena3d.camara2D.top = escena3d.tamañoVista2D;
                escena3d.camara2D.bottom = -escena3d.tamañoVista2D;
                escena3d.camara2D.updateProjectionMatrix();
            }
            if (valorAnchoPlanoGuia) valorAnchoPlanoGuia.value = `${anchoImagen.toFixed(1)} m`;
        };
        if (controlAnchoPlanoGuia) {
            controlAnchoPlanoGuia.addEventListener('input', actualizarEscalaPlanoGuia);
        }
        if (controlOpacidadPlanoGuia) {
            controlOpacidadPlanoGuia.addEventListener('input', () => {
                if (planoGuia) planoGuia.material.opacity = Number(controlOpacidadPlanoGuia.value) / 100;
                if (valorOpacidadPlanoGuia) valorOpacidadPlanoGuia.value = `${controlOpacidadPlanoGuia.value}%`;
            });
        }
        if (botonImportarPlanoGuia && inputPlanoGuia) {
            botonImportarPlanoGuia.addEventListener('click', () => inputPlanoGuia.click());
            inputPlanoGuia.addEventListener('change', () => {
                const archivo = inputPlanoGuia.files && inputPlanoGuia.files[0];
                inputPlanoGuia.value = '';
                if (!archivo) return;
                if (!archivo.type.startsWith('image/')) {
                    mostrarNotificacion('Elige una imagen PNG, JPG o WebP para usar como plano guía.', 'error');
                    return;
                }

                const urlImagen = URL.createObjectURL(archivo);
                new THREE.TextureLoader().load(urlImagen, (textura) => {
                    URL.revokeObjectURL(urlImagen);
                    const proporcion = textura.image.width / textura.image.height;
                    if (!Number.isFinite(proporcion) || proporcion <= 0) {
                        textura.dispose();
                        mostrarNotificacion('No se pudo leer el tamaño de la imagen del plano guía.', 'error');
                        return;
                    }

                    proporcionPlanoGuia = proporcion;
                    const anchoImagen = Math.max(2, Math.min(12, 12 * proporcion));
                    const altoImagen = anchoImagen / proporcion;
                    const materialGuia = new THREE.MeshBasicMaterial({
                        map: textura,
                        color: 0xffffff,
                        transparent: true,
                        opacity: 0.55,
                        depthWrite: false,
                        side: THREE.DoubleSide
                    });
                    const mallaGuia = new THREE.Mesh(
                        new THREE.PlaneGeometry(anchoImagen, altoImagen),
                        materialGuia
                    );
                    mallaGuia.rotation.x = -Math.PI / 2;
                    mallaGuia.position.set(0, nivelActual * 3 + 0.025, 0);
                    mallaGuia.renderOrder = 1;
                    mallaGuia.name = 'PlanoGuia';

                    if (planoGuia) {
                        escena3d.escena.remove(planoGuia);
                        planoGuia.geometry.dispose();
                        planoGuia.material.map.dispose();
                        planoGuia.material.dispose();
                    }
                    planoGuia = mallaGuia;
                    escena3d.escena.add(planoGuia);
                    if (controlAnchoPlanoGuia) controlAnchoPlanoGuia.value = String(anchoImagen);
                    if (valorAnchoPlanoGuia) valorAnchoPlanoGuia.value = `${anchoImagen.toFixed(1)} m`;
                    if (controlOpacidadPlanoGuia) controlOpacidadPlanoGuia.value = '55';
                    if (valorOpacidadPlanoGuia) valorOpacidadPlanoGuia.value = '55%';
                    if (controlesPlanoGuia) controlesPlanoGuia.hidden = false;
                    escena3d.tamañoVista2D = Math.max(anchoImagen, altoImagen) * 0.75;
                    escena3d.controles.target.set(0, nivelActual * 3, 0);
                    escena3d.cambiarVista('2d');
                    if (botonQuitarPlanoGuia) botonQuitarPlanoGuia.hidden = false;
                    mostrarNotificacion('Plano guía cargado. Dibuja encima con el pincel.', 'success');
                }, undefined, (error) => {
                    URL.revokeObjectURL(urlImagen);
                    console.error('Error al cargar la imagen del plano guía:', error);
                    mostrarNotificacion('No se pudo cargar la imagen del plano guía.', 'error');
                });
            });
        }
        if (botonQuitarPlanoGuia) {
            botonQuitarPlanoGuia.addEventListener('click', () => {
                if (!planoGuia) return;
                escena3d.escena.remove(planoGuia);
                planoGuia.geometry.dispose();
                planoGuia.material.map.dispose();
                planoGuia.material.dispose();
                planoGuia = null;
                botonQuitarPlanoGuia.hidden = true;
                if (controlesPlanoGuia) controlesPlanoGuia.hidden = true;
                mostrarNotificacion('Plano guía quitado.', 'info');
            });
        }

        const svgAnotaciones = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgAnotaciones.id = 'anotaciones-plano';
        svgAnotaciones.setAttribute('aria-hidden', 'true');
        contenedorCanvas.appendChild(svgAnotaciones);
        const svgSimbolosAberturas = document.getElementById('simbolos-aberturas-plano');
        const botonAnotaciones = document.getElementById('toggle-anotaciones');
        let anotacionesActivas = false;
        if (botonAnotaciones) {
            botonAnotaciones.addEventListener('click', () => {
                anotacionesActivas = !anotacionesActivas;
                botonAnotaciones.classList.toggle('active', anotacionesActivas);
                botonAnotaciones.setAttribute('aria-pressed', String(anotacionesActivas));
                svgAnotaciones.classList.toggle('visible', anotacionesActivas);
            });
        }
        window.setInterval(() => {
            if (svgSimbolosAberturas) {
                renderizarSimbolosAberturasPlano(svgSimbolosAberturas, escena3d, gestorElementos, nivelActual);
            }
            if (anotacionesActivas) {
                renderizarAnotacionesPlano(svgAnotaciones, escena3d, gestorElementos, nivelActual);
            }
        }, 120);

        const botonExportarPlano = document.getElementById('btn-exportar-plano');
        const formatoExportacion = document.getElementById('formato-exportacion-plano');
        if (botonExportarPlano) {
            botonExportarPlano.addEventListener('click', async () => {
                const formato = formatoExportacion ? formatoExportacion.value : 'png';
                if (formato === 'png') {
                    escena3d.cambiarVista('2d');
                    if (svgSimbolosAberturas) {
                        renderizarSimbolosAberturasPlano(svgSimbolosAberturas, escena3d, gestorElementos, nivelActual);
                    }
                    if (anotacionesActivas) {
                        renderizarAnotacionesPlano(svgAnotaciones, escena3d, gestorElementos, nivelActual);
                    }
                    exportarPlanoPNG(escena3d, nivelActual, svgAnotaciones, anotacionesActivas, svgSimbolosAberturas);
                    return;
                }

                try {
                    const contenidoDXF = generarContenidoDXF(gestorElementos, nivelActual);
                    if (formato === 'dxf') {
                        descargarArchivo(
                            new Blob([contenidoDXF], { type: 'application/dxf;charset=utf-8' }),
                            `plano-piso-${nivelActual}.dxf`
                        );
                        mostrarNotificacion('Plano exportado como DXF.', 'success');
                        return;
                    }

                    if (window.location.protocol === 'file:') {
                        throw new Error('Para convertir a DWG, inicia la app con iniciar_sketchplus.bat y vuelve a abrirla desde localhost.');
                    }

                    botonExportarPlano.disabled = true;
                    const respuesta = await fetch('/api/convert/dwg', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ dxf: contenidoDXF })
                    });
                    if (!respuesta.ok) {
                        const detalle = await respuesta.json().catch(() => ({}));
                        throw new Error(detalle.error || `El convertidor respondió con el estado ${respuesta.status}.`);
                    }
                    const archivoDWG = await respuesta.blob();
                    descargarArchivo(archivoDWG, `plano-piso-${nivelActual}.dwg`);
                    mostrarNotificacion('Plano convertido y exportado como DWG con ODA local.', 'success');
                } catch (error) {
                    console.error('Error al exportar el plano:', error);
                    mostrarNotificacion(error.message || 'No se pudo exportar el plano.', 'error');
                } finally {
                    botonExportarPlano.disabled = false;
                }
            });
        }

        if (botonUndo) botonUndo.addEventListener('click', deshacer);
        if (botonRedo) botonRedo.addEventListener('click', rehacer);
        window.addEventListener('keydown', (evento) => {
            const objetivo = evento.target;
            if (objetivo instanceof HTMLElement && objetivo.matches('input, textarea, select, [contenteditable="true"]')) {
                return;
            }
            if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'z') {
                evento.preventDefault();
                if (evento.shiftKey) rehacer();
                else deshacer();
            } else if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'y') {
                evento.preventDefault();
                rehacer();
            }
        });

        // 4. Callbacks para herramientas de dibujo
        const herramientas = new HerramientasDibujo(escena3d, gestorElementos, {
            onElementoSeleccionado: (elemento) => {
                window.appElementoSeleccionado = elemento;
                renderizarPanelPropiedades(elemento, gestorElementos);
                if (elemento) {
                    const pestanaPropiedades = document.querySelector('.tab-btn[data-tab="propiedades"]');
                    if (pestanaPropiedades) pestanaPropiedades.click();
                }
                if (uiPresupuesto) uiPresupuesto.actualizarVistaPresupuesto();
            },
            onElementoEliminado: (id) => {
                sincronizarPisosAutomaticos();
                if (window.appElementoSeleccionado && window.appElementoSeleccionado.id === id) {
                    window.appElementoSeleccionado = null;
                    renderizarPanelPropiedades(null);
                }
                if (uiPresupuesto) uiPresupuesto.actualizarVistaPresupuesto();
                registrarCambioModelo();
            },
            onPresupuestoActualizado: () => {
                sincronizarPisosAutomaticos();
                if (uiPresupuesto) uiPresupuesto.actualizarVistaPresupuesto();
                registrarCambioModelo();
            },
            onElementoMovido: (id) => {
                sincronizarPisosAutomaticos();
                if (uiPresupuesto) uiPresupuesto.actualizarVistaPresupuesto();
                registrarCambioModelo();
                const elementoActualizado = gestorElementos.elementosModelo.find(elemento => elemento.id === id);
                herramientas.seleccionarElemento(elementoActualizado || null);
            }
        });

        const formularioPropiedades = document.getElementById('propiedades-form');
        const actualizarElementoSeleccionado = (editar) => {
            const seleccionado = window.appElementoSeleccionado;
            if (!seleccionado) return;

            const instantanea = gestorElementos.crearInstantanea();
            const datosElemento = instantanea.find(elemento =>
                elemento.id === seleccionado.id
                || elemento.aberturas.some(abertura => abertura.id === seleccionado.id)
            );
            const datosAbertura = datosElemento && ['puerta', 'ventana'].includes(seleccionado.tipo)
                ? datosElemento.aberturas.find(abertura => abertura.id === seleccionado.id)
                : null;
            const destino = datosAbertura || datosElemento;
            if (!destino) {
                mostrarNotificacion('No se pudo actualizar el elemento seleccionado.', 'error');
                return;
            }

            try {
                if (!editar(destino, datosElemento)) return;
                gestorElementos.restaurarInstantanea(instantanea);
                sincronizarPisosAutomaticos();
                renderizarNiveles();
                const elementoActualizado = gestorElementos.elementosModelo.find(elemento =>
                    elemento.id === seleccionado.id
                );
                herramientas.seleccionarElemento(elementoActualizado || null);
                if (uiPresupuesto) uiPresupuesto.actualizarVistaPresupuesto();
                registrarCambioModelo();
            } catch (error) {
                console.error('Error al editar el elemento seleccionado:', error);
                mostrarNotificacion('No se pudo aplicar el cambio al elemento.', 'error');
            }
        };

        if (formularioPropiedades) {
            formularioPropiedades.addEventListener('change', (evento) => {
                const campo = evento.target.closest('[data-propiedad]');
                if (!campo) return;
                const seleccionado = window.appElementoSeleccionado;
                if (!seleccionado) return;

                const propiedad = campo.dataset.propiedad;
                if (propiedad === 'material') {
                    const material = LISTA_MATERIALES.find(item => item.id === campo.value);
                    if (!material) return;
                    actualizarElementoSeleccionado((datos) => {
                        datos.material = material;
                        return true;
                    });
                    return;
                }

                const valor = Number(campo.value);
                if (!Number.isFinite(valor)) {
                    mostrarNotificacion('Ingresa una medida válida.', 'error');
                    return;
                }
                actualizarElementoSeleccionado((datos, elemento) =>
                    aplicarPropiedadGeometrica(datos, elemento, propiedad, valor)
                );
            });

            formularioPropiedades.addEventListener('click', (evento) => {
                const boton = evento.target.closest('[data-accion-elemento]');
                if (!boton || !window.appElementoSeleccionado) return;
                const seleccionado = window.appElementoSeleccionado;

                if (boton.dataset.accionElemento === 'eliminar') {
                    if (!gestorElementos.eliminarElemento(seleccionado.id)) {
                        mostrarNotificacion('No se pudo eliminar el elemento seleccionado.', 'error');
                        return;
                    }
                    herramientas.seleccionarElemento(null);
                    actualizarInterfazModelo();
                    registrarCambioModelo();
                    return;
                }

                if (boton.dataset.accionElemento === 'duplicar') {
                    const instantanea = gestorElementos.crearInstantanea();
                    const original = instantanea.find(elemento => elemento.id === seleccionado.id);
                    if (!original) {
                        const muroPadre = instantanea.find(elemento =>
                            elemento.tipo === 'muro'
                            && elemento.aberturas.some(abertura => abertura.id === seleccionado.id)
                        );
                        const aberturaOriginal = muroPadre && muroPadre.aberturas.find(abertura =>
                            abertura.id === seleccionado.id
                        );
                        if (!muroPadre || !aberturaOriginal) return;
                        const aberturaDuplicada = {
                            ...aberturaOriginal,
                            id: `abertura_${generarIdUnico()}`,
                            posicionRelativa: Math.min(1, aberturaOriginal.posicionRelativa + 0.12)
                        };
                        muroPadre.aberturas.push(aberturaDuplicada);
                        try {
                            gestorElementos.restaurarInstantanea(instantanea);
                            renderizarNiveles();
                            const duplicado = gestorElementos.elementosModelo.find(elemento =>
                                elemento.id === aberturaDuplicada.id
                            );
                            herramientas.seleccionarElemento(duplicado || null);
                            if (uiPresupuesto) uiPresupuesto.actualizarVistaPresupuesto();
                            registrarCambioModelo();
                        } catch (error) {
                            console.error('Error al duplicar la abertura:', error);
                            mostrarNotificacion('No se pudo duplicar la abertura.', 'error');
                        }
                        return;
                    }

                    const duplicado = JSON.parse(JSON.stringify(original));
                    duplicado.id = `${duplicado.tipo}_${generarIdUnico()}`;
                    if (duplicado.tipo === 'muro') {
                        duplicado.p1.x += 1;
                        duplicado.p1.z += 1;
                        duplicado.p2.x += 1;
                        duplicado.p2.z += 1;
                        duplicado.aberturas.forEach(abertura => {
                            abertura.id = `abertura_${generarIdUnico()}`;
                        });
                    } else {
                        duplicado.vertices.forEach(vertice => {
                            vertice.x += 1;
                            vertice.z += 1;
                        });
                    }
                    instantanea.push(duplicado);
                    try {
                        gestorElementos.restaurarInstantanea(instantanea);
                        renderizarNiveles();
                        const elementoDuplicado = gestorElementos.elementosModelo.find(elemento =>
                            elemento.id === duplicado.id
                        );
                        herramientas.seleccionarElemento(elementoDuplicado || null);
                        if (uiPresupuesto) uiPresupuesto.actualizarVistaPresupuesto();
                        registrarCambioModelo();
                    } catch (error) {
                        console.error('Error al duplicar el elemento:', error);
                        mostrarNotificacion('No se pudo duplicar el elemento.', 'error');
                    }
                }
            });
        }

        const uiCatalogo = new UICatalogo(gestorElementos, () => {
            if (uiPresupuesto) uiPresupuesto.actualizarVistaPresupuesto();
            registrarCambioModelo();
        }, (material) => {
            herramientas.setMaterialPincel(material);
            const botonPincel = document.querySelector('.tool-btn[data-tool="pincel"]');
            if (botonPincel) botonPincel.click();
        });

        // 5. Configurar eventos de la barra de herramientas lateral
        const botonesHerramienta = document.querySelectorAll('.tool-btn');
        const controlFormaDibujo = document.getElementById('forma-dibujo');
        const contenedorFormaDibujo = document.getElementById('brush-shape-control');
        const sincronizarControlForma = () => {
            if (!controlFormaDibujo || !contenedorFormaDibujo) return;
            const herramienta = herramientas.herramientaActiva;
            const categoria = herramienta === 'piso'
                || herramienta === 'pincel' && herramientas.materialActivo
                    && herramientas.materialActivo.categoria === 'Pisos'
                ? 'Pisos'
                : 'Muros';
            const esHerramientaDibujo = ['pincel', 'muro', 'piso'].includes(herramienta)
                && (herramienta !== 'pincel' || !herramientas.materialActivo
                    || ['Muros', 'Pisos'].includes(herramientas.materialActivo.categoria));
            contenedorFormaDibujo.hidden = !esHerramientaDibujo;
            const opcionLinea = controlFormaDibujo.querySelector('option[value="linea"]');
            if (opcionLinea) opcionLinea.hidden = categoria === 'Pisos';
            if (categoria === 'Pisos' && herramientas.formaDibujo === 'linea') {
                herramientas.setFormaDibujo('poligono');
            }
            controlFormaDibujo.value = herramientas.formaDibujo;
        };

        botonesHerramienta.forEach(btn => {
            btn.addEventListener('click', () => {
                botonesHerramienta.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const tool = btn.getAttribute('data-tool');
                herramientas.setHerramienta(tool);
                sincronizarControlForma();
                const controlesAbertura = document.getElementById('tipos-abertura-controles');
                if (controlesAbertura) controlesAbertura.hidden = tool !== 'abertura';
            });
        });
        if (controlFormaDibujo) {
            controlFormaDibujo.addEventListener('change', () => {
                herramientas.setFormaDibujo(controlFormaDibujo.value);
                sincronizarControlForma();
            });
        }
        sincronizarControlForma();

        // 6. Configurar control de Snap (10cm)
        const snapToggle = document.getElementById('snap-toggle');
        if (snapToggle) {
            snapToggle.addEventListener('change', (e) => {
                escena3d.setSnapActivo(e.target.checked);
            });
        }

        // 7. Configurar botones de vistas rápidas (3D, planta, frontal, lateral)
        const botonesVista = document.querySelectorAll('.view-btn');
        botonesVista.forEach(btn => {
            btn.addEventListener('click', () => {
                const vista = btn.getAttribute('data-view');
                escena3d.cambiarVista(vista);
            });
        });

        // 8. Configurar pestañas del panel derecho (Propiedades, Catálogo, Presupuesto)
        const botonesTabs = document.querySelectorAll('.tab-btn');
        const contenidosTabs = document.querySelectorAll('.tab-content');

        botonesTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const nombreTab = tab.getAttribute('data-tab');
                botonesTabs.forEach(t => t.classList.remove('active'));
                contenidosTabs.forEach(c => c.classList.remove('active'));

                tab.classList.add('active');
                const contenidoActivo = document.getElementById(`tab-${nombreTab}`);
                if (contenidoActivo) contenidoActivo.classList.add('active');
            });
        });

        // 9. Configurar cambio de tema Claro / Oscuro
        const btnThemeToggle = document.getElementById('btn-theme-toggle');
        if (btnThemeToggle) {
            btnThemeToggle.addEventListener('click', () => {
                const htmlEl = document.documentElement;
                const temaActual = htmlEl.getAttribute('data-theme');
                const nuevoTema = temaActual === 'dark' ? 'light' : 'dark';
                htmlEl.setAttribute('data-theme', nuevoTema);
                
                // Cambiar icono del botón
                const icono = btnThemeToggle.querySelector('i');
                if (icono) {
                    icono.className = nuevoTema === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
                }
            });
        }

        const dialogEjemplos = document.getElementById('dialog-ejemplos-casas');
        const botonVerEjemplos = document.getElementById('btn-ver-ejemplos');
        if (dialogEjemplos && botonVerEjemplos) {
            botonVerEjemplos.addEventListener('click', () => dialogEjemplos.showModal());
            dialogEjemplos.querySelectorAll('[data-cerrar-ejemplos]').forEach(boton => {
                boton.addEventListener('click', () => dialogEjemplos.close());
            });
            dialogEjemplos.querySelectorAll('[data-cargar-casa]').forEach(boton => {
                boton.addEventListener('click', () => {
                    if (
                        gestorElementos.elementosModelo.length
                        && !window.confirm('Abrir este ejemplo reemplazará el plano actual. Podrás deshacerlo. ¿Continuar?')
                    ) {
                        return;
                    }

                    const estadoAnterior = crearEstadoProyecto();
                    try {
                        const plantilla = boton.dataset.cargarCasa;
                        gestorElementos.restaurarInstantanea([]);
                        cantidadNiveles = 1;
                        nivelActual = 0;
                        cargarCasaPlantilla(gestorElementos, plantilla);
                        sincronizarPisosAutomaticos();
                        const dimensiones = PLANTILLAS_CASA[plantilla].vertices;
                        const anchoCasa = Math.max(...dimensiones.map(([x]) => x)) - Math.min(...dimensiones.map(([x]) => x));
                        const fondoCasa = Math.max(...dimensiones.map(([, z]) => z)) - Math.min(...dimensiones.map(([, z]) => z));
                        escena3d.tamañoVista2D = Math.max(6, Math.max(anchoCasa, fondoCasa) * 0.75);
                        renderizarNiveles();
                        herramientas.seleccionarElemento(null);
                        escena3d.controles.target.set(0, 0, 0);
                        escena3d.cambiarVista('2d');
                        registrarCambioModelo();
                        actualizarInterfazModelo();
                        dialogEjemplos.close();
                        const pestanaPresupuesto = document.querySelector('.tab-btn[data-tab="presupuesto"]');
                        if (pestanaPresupuesto) pestanaPresupuesto.click();
                        mostrarNotificacion('Plano y presupuesto del ejemplo actualizados.', 'success');
                    } catch (error) {
                        restaurarEstadoProyecto(estadoAnterior);
                        console.error('Error al cargar el ejemplo de casa:', error);
                        mostrarNotificacion('No se pudo cargar el ejemplo; se restauró el plano anterior.', 'error');
                    }
                });
            });
        }

        console.log("SketchPlus inicializado correctamente.");
    } catch (error) {
        console.error("Error crítico al inicializar SketchPlus:", error);
    }
});

function renderizarAnotacionesPlano(svg, escena3d, gestorElementos, nivel) {
    const ancho = svg.clientWidth;
    const alto = svg.clientHeight;
    if (!ancho || !alto) return;

    svg.setAttribute('viewBox', `0 0 ${ancho} ${alto}`);
    svg.replaceChildren();
    if (!escena3d.modo2D) return;
    escena3d.camara.updateMatrixWorld();

    const proyectar = (x, y, z) => {
        const punto = new THREE.Vector3(x, y, z).project(escena3d.camara);
        return {
            x: ((punto.x + 1) / 2) * ancho,
            y: ((1 - punto.y) / 2) * alto
        };
    };

    const crearLinea = (inicio, fin) => {
        const linea = document.createElementNS(svg.namespaceURI, 'line');
        linea.setAttribute('x1', String(inicio.x));
        linea.setAttribute('y1', String(inicio.y));
        linea.setAttribute('x2', String(fin.x));
        linea.setAttribute('y2', String(fin.y));
        linea.setAttribute('class', 'annotation-line');
        svg.appendChild(linea);
    };

    const crearEtiqueta = (posicion, texto) => {
        const etiqueta = document.createElementNS(svg.namespaceURI, 'text');
        etiqueta.setAttribute('x', String(posicion.x));
        etiqueta.setAttribute('y', String(posicion.y));
        etiqueta.setAttribute('class', 'annotation-label');
        etiqueta.setAttribute('text-anchor', 'middle');
        etiqueta.textContent = texto;
        svg.appendChild(etiqueta);
    };

    const agregarCota = (inicio, fin, elevacion, texto, desplazarX, desplazarZ) => {
        const p1 = proyectar(inicio.x + desplazarX, elevacion, inicio.z + desplazarZ);
        const p2 = proyectar(fin.x + desplazarX, elevacion, fin.z + desplazarZ);
        crearLinea(p1, p2);
        crearLinea(proyectar(inicio.x, elevacion, inicio.z), p1);
        crearLinea(proyectar(fin.x, elevacion, fin.z), p2);
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const longitud = Math.hypot(dx, dy) || 1;
        const tickX = (dx / longitud) * 4;
        const tickY = (dy / longitud) * 4;
        crearLinea({ x: p1.x - tickY, y: p1.y + tickX }, { x: p1.x + tickY, y: p1.y - tickX });
        crearLinea({ x: p2.x - tickY, y: p2.y + tickX }, { x: p2.x + tickY, y: p2.y - tickX });
        crearEtiqueta({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 - 5 }, texto);
    };

    const elementosVisibles = gestorElementos.elementosModelo.filter(elemento =>
        elemento.nivel === nivel && elemento.tipo !== 'puerta' && elemento.tipo !== 'ventana'
    );
    const muros = elementosVisibles.filter(elemento => elemento.tipo === 'muro');
    const centroPlano = muros.length
        ? muros.reduce((centro, muro) => ({
            x: centro.x + (muro.p1.x + muro.p2.x) / 2 / muros.length,
            z: centro.z + (muro.p1.z + muro.p2.z) / 2 / muros.length
        }), { x: 0, z: 0 })
        : { x: 0, z: 0 };
    const offsetsPorDireccion = new Map();
    const centroPoligono = vertices => vertices.reduce((centro, vertice) => ({
        x: centro.x + vertice.x / vertices.length,
        z: centro.z + vertice.z / vertices.length
    }), { x: 0, z: 0 });
    const normalExterior = (inicio, fin, centro) => {
        const dx = fin.x - inicio.x;
        const dz = fin.z - inicio.z;
        const longitud = Math.hypot(dx, dz) || 1;
        let normalX = -dz / longitud;
        let normalZ = dx / longitud;
        const medioX = (inicio.x + fin.x) / 2;
        const medioZ = (inicio.z + fin.z) / 2;
        if ((medioX - centro.x) * normalX + (medioZ - centro.z) * normalZ < 0) {
            normalX *= -1;
            normalZ *= -1;
        }
        return { x: normalX, z: normalZ };
    };
    const paredCoincidente = (inicio, fin) => muros.some(muro =>
        (
            Math.hypot(muro.p1.x - inicio.x, muro.p1.z - inicio.z) < 0.08
            && Math.hypot(muro.p2.x - fin.x, muro.p2.z - fin.z) < 0.08
        ) || (
            Math.hypot(muro.p1.x - fin.x, muro.p1.z - fin.z) < 0.08
            && Math.hypot(muro.p2.x - inicio.x, muro.p2.z - inicio.z) < 0.08
        )
    );

    elementosVisibles.forEach(elemento => {
        if (elemento.tipo === 'muro') {
            const dx = elemento.p2.x - elemento.p1.x;
            const dz = elemento.p2.z - elemento.p1.z;
            const longitud = Math.hypot(dx, dz);
            if (!longitud) return;
            const angulo = ((Math.atan2(dz, dx) * 180 / Math.PI) % 180 + 180) % 180;
            const normal = normalExterior(elemento.p1, elemento.p2, centroPlano);
            const claveDireccion = `${Math.round(normal.x)}:${Math.round(normal.z)}`;
            const indiceDireccion = offsetsPorDireccion.get(claveDireccion) || 0;
            offsetsPorDireccion.set(claveDireccion, indiceDireccion + 1);
            const offset = 0.55 + indiceDireccion * 0.2;
            agregarCota(
                elemento.p1,
                elemento.p2,
                0.025 + nivel * 3,
                `${longitud.toFixed(2)} m · ${angulo.toFixed(0)}°`,
                normal.x * offset,
                normal.z * offset
            );
            return;
        }

        if (!elemento.vertices || elemento.vertices.length < 3) return;
        const vertices = elemento.vertices;
        const centro = centroPoligono(vertices);
        for (let indice = 0; indice < vertices.length; indice += 1) {
            const anterior = vertices[(indice - 1 + vertices.length) % vertices.length];
            const actual = vertices[indice];
            const siguiente = vertices[(indice + 1) % vertices.length];
            const largo = Math.hypot(siguiente.x - actual.x, siguiente.z - actual.z);
            if (!largo) continue;

            const elevacion = 0.025 + nivel * 3;
            if (elemento.tipo !== 'techo' && !paredCoincidente(actual, siguiente)) {
                const normal = normalExterior(actual, siguiente, centro);
                agregarCota(
                    actual,
                    siguiente,
                    elevacion,
                    `${largo.toFixed(2)} m`,
                    normal.x * 0.55,
                    normal.z * 0.55
                );
            }

            const ax = anterior.x - actual.x;
            const az = anterior.z - actual.z;
            const bx = siguiente.x - actual.x;
            const bz = siguiente.z - actual.z;
            const coseno = Math.max(-1, Math.min(1, (ax * bx + az * bz) / (Math.hypot(ax, az) * Math.hypot(bx, bz))));
            const angulo = Math.acos(coseno) * 180 / Math.PI;
            const etiquetaAngulo = proyectar(
                actual.x + (centro.x - actual.x) * 0.12,
                elevacion,
                actual.z + (centro.z - actual.z) * 0.12
            );
            crearEtiqueta(etiquetaAngulo, `${angulo.toFixed(0)}°`);
        }
    });
}

function renderizarSimbolosAberturasPlano(svg, escena3d, gestorElementos, nivel) {
    const ancho = svg.clientWidth;
    const alto = svg.clientHeight;
    if (!ancho || !alto) return;
    svg.setAttribute('viewBox', `0 0 ${ancho} ${alto}`);
    svg.replaceChildren();
    if (!escena3d.modo2D) return;
    escena3d.camara.updateMatrixWorld();

    const proyectar = (x, z) => {
        const punto = new THREE.Vector3(x, nivel * 3 + 0.03, z).project(escena3d.camara);
        return {
            x: ((punto.x + 1) / 2) * ancho,
            y: ((1 - punto.y) / 2) * alto
        };
    };
    const agregarLinea = (grupo, inicio, fin, color = '#0f172a', grosor = 1.8) => {
        const linea = document.createElementNS(svg.namespaceURI, 'line');
        linea.setAttribute('x1', String(inicio.x));
        linea.setAttribute('y1', String(inicio.y));
        linea.setAttribute('x2', String(fin.x));
        linea.setAttribute('y2', String(fin.y));
        linea.setAttribute('stroke', color);
        linea.setAttribute('stroke-width', String(grosor));
        linea.setAttribute('stroke-linecap', 'round');
        grupo.appendChild(linea);
    };

    for (const muro of gestorElementos.elementosModelo) {
        if (muro.tipo !== 'muro' || muro.nivel !== nivel || !muro.malla.visible) continue;
        const dx = muro.p2.x - muro.p1.x;
        const dz = muro.p2.z - muro.p1.z;
        const longitud = Math.hypot(dx, dz);
        if (!longitud) continue;
        const ux = dx / longitud;
        const uz = dz / longitud;

        for (const abertura of muro.aberturas || []) {
            const centro = Math.max(0, Math.min(longitud, abertura.posicionRelativa * longitud));
            const mitad = Math.min((abertura.ancho || 0.9) / 2, longitud / 2);
            const inicio = proyectar(muro.p1.x + ux * (centro - mitad), muro.p1.z + uz * (centro - mitad));
            const fin = proyectar(muro.p1.x + ux * (centro + mitad), muro.p1.z + uz * (centro + mitad));
            const ejeX = fin.x - inicio.x;
            const ejeY = fin.y - inicio.y;
            const largoPixeles = Math.hypot(ejeX, ejeY) || 1;
            const uxPantalla = ejeX / largoPixeles;
            const uyPantalla = ejeY / largoPixeles;
            const nxPantalla = -uyPantalla;
            const nyPantalla = uxPantalla;
            const grupo = document.createElementNS(svg.namespaceURI, 'g');
            const subtipo = abertura.tipoAbertura || abertura.tipo;
            const etiqueta = {
                puerta: 'Puerta abatible',
                'puerta-doble': 'Puerta doble',
                'puerta-corredera': 'Puerta corredera',
                'ventana-fija': 'Ventana fija',
                'ventana-corredera': 'Ventana corredera',
                'porton-garaje': 'Portón de garaje',
                ventana: 'Ventana'
            }[subtipo] || 'Puerta';
            const titulo = document.createElementNS(svg.namespaceURI, 'title');
            titulo.textContent = `${etiqueta} · ${abertura.ancho.toFixed(2)} × ${abertura.alto.toFixed(2)} m`;
            grupo.appendChild(titulo);
            agregarLinea(grupo, inicio, fin, '#ffffff', 6);

            if (subtipo.startsWith('ventana') || subtipo === 'ventana') {
                for (const desplazamiento of [-2, 2]) {
                    agregarLinea(grupo, {
                        x: inicio.x + nxPantalla * desplazamiento,
                        y: inicio.y + nyPantalla * desplazamiento
                    }, {
                        x: fin.x + nxPantalla * desplazamiento,
                        y: fin.y + nyPantalla * desplazamiento
                    });
                }
                const centro = {
                    x: (inicio.x + fin.x) / 2,
                    y: (inicio.y + fin.y) / 2
                };
                if (subtipo === 'ventana-corredera') {
                    for (const sentido of [-1, 1]) {
                        const punta = {
                            x: centro.x + uxPantalla * sentido * 7,
                            y: centro.y + uyPantalla * sentido * 7
                        };
                        const base = {
                            x: centro.x - uxPantalla * sentido * 2,
                            y: centro.y - uyPantalla * sentido * 2
                        };
                        agregarLinea(grupo, base, punta);
                        agregarLinea(grupo, punta, {
                            x: punta.x - uxPantalla * sentido * 3 + nxPantalla * 2,
                            y: punta.y - uyPantalla * sentido * 3 + nyPantalla * 2
                        });
                        agregarLinea(grupo, punta, {
                            x: punta.x - uxPantalla * sentido * 3 - nxPantalla * 2,
                            y: punta.y - uyPantalla * sentido * 3 - nyPantalla * 2
                        });
                    }
                } else {
                    agregarLinea(grupo, {
                        x: centro.x + nxPantalla * 7,
                        y: centro.y + nyPantalla * 7
                    }, {
                        x: centro.x - nxPantalla * 7,
                        y: centro.y - nyPantalla * 7
                    });
                }
            } else if (subtipo === 'porton-garaje') {
                for (let indice = 1; indice <= 4; indice += 1) {
                    const fraccion = indice / 5;
                    const centroLinea = {
                        x: inicio.x + ejeX * fraccion,
                        y: inicio.y + ejeY * fraccion
                    };
                    agregarLinea(grupo, {
                        x: centroLinea.x - nxPantalla * 5,
                        y: centroLinea.y - nyPantalla * 5
                    }, {
                        x: centroLinea.x + nxPantalla * 5,
                        y: centroLinea.y + nyPantalla * 5
                    });
                }
            } else {
                const hojasDobles = subtipo === 'puerta-doble';
                const lados = hojasDobles ? [0, 1] : [0];
                lados.forEach(lado => {
                    const bisagra = lado === 0 ? inicio : fin;
                    const sentido = lado === 0 ? 1 : -1;
                    const radio = Math.min(24, Math.max(10, largoPixeles));
                    const punta = {
                        x: bisagra.x + nxPantalla * radio,
                        y: bisagra.y + nyPantalla * radio
                    };
                    agregarLinea(grupo, bisagra, punta);
                    const extremo = lado === 0 ? fin : inicio;
                    const medio = {
                        x: (punta.x + extremo.x) / 2 + nxPantalla * sentido * radio * 0.35,
                        y: (punta.y + extremo.y) / 2 + nyPantalla * sentido * radio * 0.35
                    };
                    const arco = document.createElementNS(svg.namespaceURI, 'path');
                    arco.setAttribute('d', `M ${punta.x} ${punta.y} Q ${medio.x} ${medio.y} ${extremo.x} ${extremo.y}`);
                    arco.setAttribute('fill', 'none');
                    arco.setAttribute('stroke', '#0f172a');
                    arco.setAttribute('stroke-width', '1.2');
                    grupo.appendChild(arco);
                });
                if (subtipo === 'puerta-corredera') {
                    agregarLinea(grupo, {
                        x: inicio.x + nxPantalla * 3,
                        y: inicio.y + nyPantalla * 3
                    }, {
                        x: fin.x + nxPantalla * 3,
                        y: fin.y + nyPantalla * 3
                    }, '#0f172a', 1.2);
                }
            }
            const marca = document.createElementNS(svg.namespaceURI, 'text');
            marca.setAttribute('x', String((inicio.x + fin.x) / 2 + nxPantalla * 12));
            marca.setAttribute('y', String((inicio.y + fin.y) / 2 + nyPantalla * 12));
            marca.setAttribute('fill', '#0f172a');
            marca.setAttribute('stroke', '#ffffff');
            marca.setAttribute('stroke-width', '3');
            marca.setAttribute('paint-order', 'stroke');
            marca.setAttribute('font-size', '9');
            marca.setAttribute('font-family', 'system-ui, sans-serif');
            marca.setAttribute('font-weight', '700');
            marca.setAttribute('text-anchor', 'middle');
            marca.textContent = subtipo === 'porton-garaje' ? 'G' : subtipo.startsWith('ventana') ? 'V' : 'P';
            grupo.appendChild(marca);
            svg.appendChild(grupo);
        }
    }
}

function generarContenidoDXF(gestorElementos, nivel) {
    const elementos = gestorElementos.elementosModelo.filter(elemento =>
        elemento.nivel === nivel && ['muro', 'piso', 'techo'].includes(elemento.tipo)
    );
    if (!elementos.length) {
        throw new Error('No hay muros, pisos o techos en el nivel actual para exportar.');
    }

    const entidades = [];
    const numero = valor => {
        if (!Number.isFinite(valor)) throw new Error('El plano contiene una coordenada no válida.');
        return valor.toFixed(6);
    };
    const linea = (inicio, fin, capa) => {
        entidades.push(
            '0', 'LINE', '100', 'AcDbEntity', '8', capa, '100', 'AcDbLine',
            '10', numero(inicio.x), '20', numero(inicio.y), '30', '0',
            '11', numero(fin.x), '21', numero(fin.y), '31', '0'
        );
    };
    const polilinea = (puntos, capa, cerrada = false) => {
        if (puntos.length < 2) return;
        entidades.push(
            '0', 'LWPOLYLINE', '100', 'AcDbEntity', '8', capa,
            '100', 'AcDbPolyline', '90', String(puntos.length), '70', cerrada ? '1' : '0'
        );
        puntos.forEach(punto => {
            entidades.push('10', numero(punto.x), '20', numero(punto.y));
        });
    };

    elementos.forEach(elemento => {
        if (elemento.tipo === 'muro') {
            const dx = elemento.p2.x - elemento.p1.x;
            const dz = elemento.p2.z - elemento.p1.z;
            const longitud = Math.hypot(dx, dz);
            if (!longitud) return;
            const ux = dx / longitud;
            const uy = dz / longitud;
            const espesor = Math.max(0, elemento.espesor || 0.15);
            const nx = -uy * espesor / 2;
            const ny = ux * espesor / 2;
            const aberturas = (elemento.aberturas || [])
                .map(abertura => {
                    const centro = Math.max(0, Math.min(longitud,
                        (abertura.posicionRelativa || 0) * longitud
                    ));
                    const mitad = Math.max(0, abertura.ancho || 0.9) / 2;
                    return {
                        inicio: Math.max(0, centro - mitad),
                        fin: Math.min(longitud, centro + mitad),
                        centro,
                        tipo: abertura.tipo,
                        tipoAbertura: abertura.tipoAbertura || abertura.tipo
                    };
                })
                .filter(abertura => abertura.fin > abertura.inicio)
                .sort((a, b) => a.inicio - b.inicio);

            const segmentos = [];
            let cursor = 0;
            aberturas.forEach(abertura => {
                if (abertura.inicio > cursor) segmentos.push([cursor, abertura.inicio]);
                cursor = Math.max(cursor, abertura.fin);
            });
            if (cursor < longitud) segmentos.push([cursor, longitud]);

            const punto = (distancia, lado) => ({
                x: elemento.p1.x + ux * distancia + nx * lado,
                y: elemento.p1.z + uy * distancia + ny * lado
            });
            segmentos.forEach(([inicio, fin]) => {
                [-1, 1].forEach(lado => linea(punto(inicio, lado), punto(fin, lado), 'MUROS'));
            });
            linea(punto(0, -1), punto(0, 1), 'MUROS');
            linea(punto(longitud, -1), punto(longitud, 1), 'MUROS');

            aberturas.forEach(abertura => {
                if (abertura.tipo === 'ventana') {
                    linea(punto(abertura.inicio, -0.035), punto(abertura.fin, -0.035), 'VENTANAS');
                    linea(punto(abertura.inicio, 0.035), punto(abertura.fin, 0.035), 'VENTANAS');
                    if (abertura.tipoAbertura === 'ventana-corredera') {
                        const paso = Math.min(0.18, (abertura.fin - abertura.inicio) * 0.12);
                        linea(punto(abertura.centro - paso * 2, -0.07), punto(abertura.centro, 0), 'VENTANAS');
                        linea(punto(abertura.centro - paso * 2, 0.07), punto(abertura.centro, 0), 'VENTANAS');
                        linea(punto(abertura.centro + paso * 2, -0.07), punto(abertura.centro, 0), 'VENTANAS');
                        linea(punto(abertura.centro + paso * 2, 0.07), punto(abertura.centro, 0), 'VENTANAS');
                    } else {
                        linea(punto(abertura.centro, -0.07), punto(abertura.centro, 0.07), 'VENTANAS');
                    }
                } else if (abertura.tipoAbertura === 'porton-garaje') {
                    for (let indice = 1; indice <= 4; indice += 1) {
                        const distancia = abertura.inicio
                            + ((abertura.fin - abertura.inicio) * indice / 5);
                        linea(punto(distancia, -0.08), punto(distancia, 0.08), 'PUERTAS');
                    }
                } else if (abertura.tipoAbertura === 'puerta-doble') {
                    const centro = abertura.centro;
                    const hoja = Math.min((abertura.fin - abertura.inicio) / 2, 0.8);
                    linea(punto(abertura.inicio, 0), punto(abertura.inicio + hoja, 1), 'PUERTAS');
                    linea(punto(abertura.fin, 0), punto(abertura.fin - hoja, -1), 'PUERTAS');
                    linea(punto(centro - 0.05, 0), punto(centro + 0.05, 0), 'PUERTAS');
                } else if (abertura.tipoAbertura === 'puerta-corredera') {
                    linea(punto(abertura.inicio, -0.04), punto(abertura.fin, -0.04), 'PUERTAS');
                    linea(punto(abertura.inicio, 0.04), punto(abertura.fin, 0.04), 'PUERTAS');
                } else {
                    const hoja = Math.min(abertura.fin - abertura.inicio, 0.8);
                    linea(punto(abertura.inicio, 0), punto(abertura.inicio + hoja, 1), 'PUERTAS');
                }
            });
            return;
        }

        const vertices = (elemento.vertices || []).map(vertice => ({
            x: vertice.x,
            y: vertice.z
        }));
        polilinea(vertices, elemento.tipo === 'piso' ? 'PISOS' : 'TECHOS', true);
    });

    const capas = [
        ['MUROS', '7'],
        ['PISOS', '3'],
        ['TECHOS', '4'],
        ['PUERTAS', '2'],
        ['VENTANAS', '5']
    ];
    const dxf = [
        '0', 'SECTION', '2', 'HEADER',
        '9', '$ACADVER', '1', 'AC1027',
        '9', '$INSUNITS', '70', '6',
        '0', 'ENDSEC',
        '0', 'SECTION', '2', 'TABLES',
        '0', 'TABLE', '2', 'LTYPE', '70', '1',
        '0', 'LTYPE', '100', 'AcDbSymbolTableRecord', '100', 'AcDbLinetypeTableRecord',
        '2', 'CONTINUOUS', '70', '0', '3', 'Solid line', '72', '65', '73', '0', '40', '0',
        '0', 'ENDTAB',
        '0', 'TABLE', '2', 'LAYER', '70', String(capas.length + 1),
        '0', 'LAYER', '100', 'AcDbSymbolTableRecord', '100', 'AcDbLayerTableRecord',
        '2', '0', '70', '0', '62', '7', '6', 'CONTINUOUS'
    ];
    capas.forEach(([nombre, color]) => {
        dxf.push(
            '0', 'LAYER', '100', 'AcDbSymbolTableRecord', '100', 'AcDbLayerTableRecord',
            '2', nombre, '70', '0', '62', color, '6', 'CONTINUOUS'
        );
    });
    dxf.push(
        '0', 'ENDTAB', '0', 'ENDSEC',
        '0', 'SECTION', '2', 'BLOCKS', '0', 'ENDSEC',
        '0', 'SECTION', '2', 'ENTITIES', ...entidades, '0', 'ENDSEC', '0', 'EOF'
    );
    return dxf.join('\r\n');
}

function descargarArchivo(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportarPlanoPNG(escena3d, nivel, svgAnotaciones, anotacionesActivas, svgSimbolosAberturas) {
    try {
        escena3d.cambiarVista('2d');
        escena3d.renderizador.render(escena3d.escena, escena3d.camara);
        const lienzo = document.createElement('canvas');
        lienzo.width = escena3d.renderizador.domElement.width;
        lienzo.height = escena3d.renderizador.domElement.height;
        const contexto = lienzo.getContext('2d');
        if (!contexto) throw new Error('No se pudo crear el lienzo de exportación.');

        contexto.fillStyle = '#ffffff';
        contexto.fillRect(0, 0, lienzo.width, lienzo.height);
        contexto.drawImage(escena3d.renderizador.domElement, 0, 0);

        const descargar = () => {
            lienzo.toBlob(blob => {
                if (!blob) {
                    mostrarNotificacion('No se pudo exportar el plano como PNG.', 'error');
                    return;
                }
                const url = URL.createObjectURL(blob);
                const enlace = document.createElement('a');
                enlace.href = url;
                enlace.download = `plano-piso-${nivel}-${Date.now()}.png`;
                enlace.click();
                window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                mostrarNotificacion('Plano exportado como PNG.', 'success');
            }, 'image/png');
        };

        const hayAnotaciones = anotacionesActivas && svgAnotaciones.childElementCount;
        const haySimbolos = svgSimbolosAberturas && svgSimbolosAberturas.childElementCount;
        if (!hayAnotaciones && !haySimbolos) {
            descargar();
            return;
        }

        const svgParaExportar = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        const fuenteDimensiones = hayAnotaciones ? svgAnotaciones : svgSimbolosAberturas;
        svgParaExportar.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svgParaExportar.setAttribute('width', String(fuenteDimensiones.clientWidth));
        svgParaExportar.setAttribute('height', String(fuenteDimensiones.clientHeight));
        svgParaExportar.setAttribute('viewBox', `0 0 ${fuenteDimensiones.clientWidth} ${fuenteDimensiones.clientHeight}`);
        const estilosSVG = document.createElementNS(svgParaExportar.namespaceURI, 'style');
        estilosSVG.textContent = '.annotation-line{stroke:#475569;stroke-width:1;stroke-opacity:.65}.annotation-label{fill:#334155;stroke:#f8fafc;stroke-width:4px;stroke-linejoin:round;paint-order:stroke;font-size:11px;font-weight:600;font-family:system-ui,sans-serif}';
        svgParaExportar.appendChild(estilosSVG);
        if (hayAnotaciones) {
            [...svgAnotaciones.childNodes].forEach(nodo => svgParaExportar.appendChild(nodo.cloneNode(true)));
        }
        if (haySimbolos) {
            [...svgSimbolosAberturas.childNodes].forEach(nodo => svgParaExportar.appendChild(nodo.cloneNode(true)));
        }
        const contenidoSVG = new XMLSerializer().serializeToString(svgParaExportar);
        const urlSVG = URL.createObjectURL(new Blob([contenidoSVG], { type: 'image/svg+xml;charset=utf-8' }));
        const imagenAnotaciones = new Image();
        imagenAnotaciones.onload = () => {
            contexto.drawImage(imagenAnotaciones, 0, 0, lienzo.width, lienzo.height);
            URL.revokeObjectURL(urlSVG);
            descargar();
        };
        imagenAnotaciones.onerror = () => {
            URL.revokeObjectURL(urlSVG);
            mostrarNotificacion('No se pudieron incluir los símbolos y las medidas en el PNG.', 'error');
        };
        imagenAnotaciones.src = urlSVG;
    } catch (error) {
        console.error('Error al exportar el plano:', error);
        mostrarNotificacion('No se pudo exportar el plano como PNG.', 'error');
    }
}

/**
 * Renderiza el panel de propiedades del elemento seleccionado.
 * @param {Object|null} elemento 
 */
function aplicarPropiedadGeometrica(datos, elemento, propiedad, valor) {
    if (['puerta', 'ventana'].includes(elemento.tipo)) {
        if (propiedad === 'posicionAbertura') {
            datos.posicionRelativa = Math.max(0, Math.min(1, valor / 100));
            return true;
        }
        if (propiedad === 'anchoAbertura' || propiedad === 'altoAbertura') {
            if (valor <= 0) {
                mostrarNotificacion('El ancho y el alto deben ser mayores que cero.', 'error');
                return false;
            }
            datos[propiedad === 'anchoAbertura' ? 'ancho' : 'alto'] = valor;
            return true;
        }
        return false;
    }

    if (elemento.tipo === 'muro') {
        const centro = {
            x: (datos.p1.x + datos.p2.x) / 2,
            z: (datos.p1.z + datos.p2.z) / 2
        };
        const dx = datos.p2.x - datos.p1.x;
        const dz = datos.p2.z - datos.p1.z;
        const longitud = Math.hypot(dx, dz);
        const angulo = Math.atan2(dz, dx);

        if (propiedad === 'posicionX' || propiedad === 'posicionZ') {
            const cambio = valor - centro[propiedad === 'posicionX' ? 'x' : 'z'];
            datos.p1[propiedad === 'posicionX' ? 'x' : 'z'] += cambio;
            datos.p2[propiedad === 'posicionX' ? 'x' : 'z'] += cambio;
        } else if (propiedad === 'rotacion') {
            const nuevoAngulo = valor * Math.PI / 180;
            datos.p1 = {
                x: centro.x - Math.cos(nuevoAngulo) * longitud / 2,
                z: centro.z - Math.sin(nuevoAngulo) * longitud / 2
            };
            datos.p2 = {
                x: centro.x + Math.cos(nuevoAngulo) * longitud / 2,
                z: centro.z + Math.sin(nuevoAngulo) * longitud / 2
            };
        } else if (propiedad === 'longitud') {
            if (valor < 0.05) {
                mostrarNotificacion('La longitud del muro debe ser de al menos 0,05 m.', 'error');
                return false;
            }
            datos.p1 = {
                x: centro.x - Math.cos(angulo) * valor / 2,
                z: centro.z - Math.sin(angulo) * valor / 2
            };
            datos.p2 = {
                x: centro.x + Math.cos(angulo) * valor / 2,
                z: centro.z + Math.sin(angulo) * valor / 2
            };
        } else if (propiedad === 'altura' || propiedad === 'espesor') {
            if (valor <= 0) {
                mostrarNotificacion('La altura y el espesor deben ser mayores que cero.', 'error');
                return false;
            }
            datos[propiedad] = valor;
        } else {
            return false;
        }
        return true;
    }

    if (!Array.isArray(datos.vertices) || !datos.vertices.length) return false;
    const centro = datos.vertices.reduce((suma, vertice) => ({
        x: suma.x + vertice.x / datos.vertices.length,
        z: suma.z + vertice.z / datos.vertices.length
    }), { x: 0, z: 0 });
    const limites = datos.vertices.reduce((resultado, vertice) => ({
        minX: Math.min(resultado.minX, vertice.x),
        maxX: Math.max(resultado.maxX, vertice.x),
        minZ: Math.min(resultado.minZ, vertice.z),
        maxZ: Math.max(resultado.maxZ, vertice.z)
    }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });

    if (propiedad === 'posicionX' || propiedad === 'posicionZ') {
        const eje = propiedad === 'posicionX' ? 'x' : 'z';
        const cambio = valor - centro[eje];
        datos.vertices.forEach(vertice => { vertice[eje] += cambio; });
    } else if (propiedad === 'rotacion') {
        const primero = datos.vertices[0];
        const segundo = datos.vertices[1];
        const anguloActual = Math.atan2(segundo.z - primero.z, segundo.x - primero.x);
        const diferencia = valor * Math.PI / 180 - anguloActual;
        datos.vertices = datos.vertices.map(vertice => {
            const dx = vertice.x - centro.x;
            const dz = vertice.z - centro.z;
            return {
                x: centro.x + dx * Math.cos(diferencia) - dz * Math.sin(diferencia),
                z: centro.z + dx * Math.sin(diferencia) + dz * Math.cos(diferencia)
            };
        });
    } else if (propiedad === 'ancho' || propiedad === 'profundidad') {
        if (valor <= 0) {
            mostrarNotificacion('El ancho y la profundidad deben ser mayores que cero.', 'error');
            return false;
        }
        const eje = propiedad === 'ancho' ? 'x' : 'z';
        const actual = eje === 'x' ? limites.maxX - limites.minX : limites.maxZ - limites.minZ;
        if (actual < 0.001) return false;
        const escala = valor / actual;
        datos.vertices.forEach(vertice => { vertice[eje] = centro[eje] + (vertice[eje] - centro[eje]) * escala; });
    } else if (propiedad === 'espesor') {
        if (valor <= 0) {
            mostrarNotificacion('El espesor debe ser mayor que cero.', 'error');
            return false;
        }
        datos.espesor = valor;
    } else {
        return false;
    }
    return true;
}

function renderizarPanelPropiedades(elemento, gestorElementos = null) {
    const contenedorVacio = document.getElementById('propiedades-vacio');
    const formulario = document.getElementById('propiedades-form');

    if (!contenedorVacio || !formulario) return;

    if (!elemento) {
        contenedorVacio.classList.remove('hidden');
        formulario.classList.add('hidden');
        formulario.innerHTML = '';
        return;
    }

    contenedorVacio.classList.add('hidden');
    formulario.classList.remove('hidden');

    const esAbertura = elemento.tipo === 'puerta' || elemento.tipo === 'ventana';
    const nombresAbertura = {
        puerta: 'Puerta abatible',
        'puerta-doble': 'Puerta doble',
        'puerta-corredera': 'Puerta corredera',
        'ventana-fija': 'Ventana fija',
        'ventana-corredera': 'Ventana corredera',
        'porton-garaje': 'Portón de garaje'
    };
    const nombreElemento = esAbertura
        ? nombresAbertura[elemento.tipoAbertura || elemento.tipo]
            || (elemento.tipo === 'puerta' ? 'Puerta abatible' : 'Ventana fija')
        : elemento.tipo.toUpperCase();
    const muroPadre = esAbertura && gestorElementos
        ? gestorElementos.elementosModelo.find(item => item.tipo === 'muro' && item.aberturas.includes(elemento))
        : null;
    const categoriaMaterial = esAbertura
        ? elemento.tipo === 'puerta' ? 'Puertas' : 'Ventanas'
        : elemento.tipo === 'muro' ? 'Muros' : elemento.tipo === 'piso' ? 'Pisos' : 'Techos';
    const materialActual = elemento.material
        || LISTA_MATERIALES.find(material => material.categoria === categoriaMaterial);
    const opcionesMaterial = LISTA_MATERIALES
        .filter(material => material.categoria === categoriaMaterial)
        .map(material => `<option value="${material.id}" ${materialActual && material.id === materialActual.id ? 'selected' : ''}>${material.nombre} · ${material.gama}</option>`)
        .join('');
    const campo = (etiqueta, propiedad, valor, paso = '0.1') => `
        <label class="propiedad-campo">
            <span>${etiqueta}</span>
            <div><input type="number" step="${paso}" value="${Number(valor || 0).toFixed(2)}" data-propiedad="${propiedad}" aria-label="${etiqueta}"><small>m</small></div>
        </label>
    `;
    let controlesGeometria = '';

    if (esAbertura) {
        controlesGeometria = `
            ${campo('Posición sobre el muro', 'posicionAbertura', elemento.posicionRelativa * 100, '1').replace('>m</small>', '>%</small>')}
            ${campo('Ancho', 'anchoAbertura', elemento.ancho)}
            ${campo('Alto', 'altoAbertura', elemento.alto)}
        `;
    } else if (elemento.tipo === 'muro') {
        controlesGeometria = `
            ${campo('Centro X', 'posicionX', (elemento.p1.x + elemento.p2.x) / 2)}
            ${campo('Centro Y', 'posicionZ', (elemento.p1.z + elemento.p2.z) / 2)}
            ${campo('Longitud', 'longitud', elemento.longitud)}
            ${campo('Ángulo', 'rotacion', Math.atan2(elemento.p2.z - elemento.p1.z, elemento.p2.x - elemento.p1.x) * 180 / Math.PI, '1').replace('>m</small>', '>°</small>')}
            ${campo('Altura', 'altura', elemento.altura)}
            ${campo('Espesor', 'espesor', elemento.espesor)}
        `;
    } else {
        const vertices = elemento.vertices || [];
        const centro = vertices.reduce((suma, vertice) => ({
            x: suma.x + vertice.x / vertices.length,
            z: suma.z + vertice.z / vertices.length
        }), { x: 0, z: 0 });
        const xs = vertices.map(vertice => vertice.x);
        const zs = vertices.map(vertice => vertice.z);
        const angulo = vertices.length > 1
            ? Math.atan2(vertices[1].z - vertices[0].z, vertices[1].x - vertices[0].x) * 180 / Math.PI
            : 0;
        controlesGeometria = `
            ${campo('Centro X', 'posicionX', centro.x)}
            ${campo('Centro Y', 'posicionZ', centro.z)}
            ${campo('Ancho', 'ancho', Math.max(...xs) - Math.min(...xs))}
            ${campo('Profundidad', 'profundidad', Math.max(...zs) - Math.min(...zs))}
            ${campo('Ángulo', 'rotacion', angulo, '1').replace('>m</small>', '>°</small>')}
            ${campo('Espesor', 'espesor', elemento.espesor)}
        `;
    }

    formulario.innerHTML = `
        <div class="elemento-propiedades">
            <div class="elemento-propiedades-identidad">
                <span>${nombreElemento}</span>
                <small>${elemento.id}</small>
            </div>
            <label class="propiedad-campo">
                <span>Material</span>
                <select data-propiedad="material" aria-label="Material del elemento">${opcionesMaterial}</select>
            </label>
            <div class="elemento-propiedades-geometria">${controlesGeometria}</div>
            <div class="elemento-propiedades-acciones">
                <button type="button" class="btn-secondary" data-accion-elemento="duplicar"><i class="fa-regular fa-copy"></i> Duplicar</button>
                <button type="button" class="btn-eliminar-elemento" data-accion-elemento="eliminar"><i class="fa-solid fa-trash-can"></i> Eliminar</button>
            </div>
            <small class="elemento-propiedades-ayuda">Arrastra el objeto para moverlo. Los cambios se pueden deshacer.</small>
        </div>
    `;
}

function cargarCasaPlantilla(gestor, nombrePlantilla) {
    const plantilla = PLANTILLAS_CASA[nombrePlantilla];
    if (!plantilla) throw new Error(`No existe la plantilla de casa "${nombrePlantilla}".`);

    const materialMuro = LISTA_MATERIALES.find(material => material.id === plantilla.materialMuro);
    const materialPiso = LISTA_MATERIALES.find(material => material.id === plantilla.materialPiso);
    const materialPuerta = LISTA_MATERIALES.find(material => material.categoria === 'Puertas');
    const materialVentana = LISTA_MATERIALES.find(material => material.categoria === 'Ventanas');
    if (!materialMuro || !materialPiso || !materialPuerta || !materialVentana) {
        throw new Error(`Faltan materiales necesarios para la plantilla "${nombrePlantilla}".`);
    }

    plantilla.paredes.forEach(([inicio, fin, tipoAbertura]) => {
        const muro = gestor.crearMuro(
            { x: inicio[0], z: inicio[1] },
            { x: fin[0], z: fin[1] },
            2.8,
            0.15,
            materialMuro,
            0
        );
        if (!muro) throw new Error('No se pudo crear uno de los muros del ejemplo.');
        const abertura = gestor.crearAberturaEnMuro(
            muro,
            tipoAbertura,
            0.5,
            tipoAbertura === 'puerta' ? materialPuerta : materialVentana
        );
        if (!abertura) throw new Error('No se pudo crear una puerta o ventana del ejemplo.');
    });

    const vertices = plantilla.vertices.map(([x, z]) => ({ x, z }));
    if (!gestor.crearPiso(vertices, 0.2, materialPiso, 0)) {
        throw new Error('No se pudo crear el piso del ejemplo.');
    }
}