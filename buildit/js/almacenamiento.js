/**
 * /js/almacenamiento.js
 * Gestión de persistencia local (localStorage) y exportación/importación de proyectos en JSON.
 */

import { mostrarNotificacion } from './utilidades.js';

export class AlmacenamientoProyecto {
    /**
     * @param {Object} gestorElementos - Instancia de GestorElementos.
     */
    constructor(gestorElementos) {
        if (!gestorElementos) {
            throw new Error("Se requiere GestorElementos en AlmacenamientoProyecto.");
        }
        this.gestorElementos = gestorElementos;
        this.CLAVE_STORAGE = 'construcalc_3d_proyecto_activo';
    }

    /**
     * Guarda el estado actual del proyecto en localStorage.
     */
    guardarEnLocalStorage() {
        return this.guardarProyectoLocal();
    }

    guardarProyectoLocal(niveles = 2) {
        try {
            const proyecto = {
                version: 1,
                niveles,
                elementos: this.gestorElementos.crearInstantanea()
            };
            localStorage.setItem(this.CLAVE_STORAGE, JSON.stringify(proyecto));
            mostrarNotificacion("Proyecto guardado en este dispositivo.", "success");
            return true;
        } catch (error) {
            console.error("Error al guardar el proyecto:", error);
            mostrarNotificacion("No se pudo guardar el proyecto en este dispositivo.", "error");
            return false;
        }
    }

    cargarProyectoLocal() {
        try {
            const datos = localStorage.getItem(this.CLAVE_STORAGE);
            if (!datos) return null;

            const proyecto = JSON.parse(datos);
            let elementos;
            let niveles;
            if (Array.isArray(proyecto)) {
                elementos = proyecto
                    .filter(elemento => elemento.tipo !== 'puerta' && elemento.tipo !== 'ventana')
                    .map(elemento => ({
                        ...elemento,
                        aberturas: Array.isArray(elemento.aberturas)
                            ? elemento.aberturas.map(abertura => ({
                                id: abertura.id,
                                tipo: abertura.tipo,
                                tipoAbertura: abertura.tipoAbertura || abertura.tipo,
                                posicionRelativa: abertura.posicionRelativa,
                                material: abertura.material || null,
                                ancho: abertura.ancho,
                                alto: abertura.alto
                            }))
                            : []
                    }));
                const nivelMaximo = elementos.reduce((maximo, elemento) => Math.max(maximo, elemento.nivel || 0), 0);
                niveles = Math.max(2, nivelMaximo + 1);
            } else if (proyecto && proyecto.version === 1 && Array.isArray(proyecto.elementos)) {
                elementos = proyecto.elementos;
                niveles = Number.isInteger(proyecto.niveles) && proyecto.niveles > 0 ? proyecto.niveles : 1;
            } else {
                throw new Error("El formato del proyecto guardado no es compatible.");
            }

            const cantidadTechosOmitidos = elementos.filter(elemento =>
                elemento.tipo === 'techo' && (!Array.isArray(elemento.vertices) || elemento.vertices.length < 3)
            ).length;
            if (cantidadTechosOmitidos) {
                console.warn(`Se omitieron ${cantidadTechosOmitidos} techo(s) sin vértices válidos al cargar el proyecto.`);
                mostrarNotificacion(
                    `Se omitieron ${cantidadTechosOmitidos} techo(s) antiguos que no se podían restaurar.`,
                    "info"
                );
                elementos = elementos.filter(elemento =>
                    elemento.tipo !== 'techo' || (Array.isArray(elemento.vertices) && elemento.vertices.length >= 3)
                );
            }

            this.gestorElementos.restaurarInstantanea(elementos);
            return {
                niveles
            };
        } catch (error) {
            console.error("Error al cargar el proyecto guardado:", error);
            mostrarNotificacion("No se pudo cargar el proyecto guardado.", "error");
            return null;
        }
    }

    /**
     * Exporta el proyecto completo como un archivo descargable JSON.
     */
    exportarJSON() {
        try {
            const datosSerializable = this.gestorElementos.elementosModelo
                .filter(el => el.tipo !== 'puerta' && el.tipo !== 'ventana')
                .map(el => ({
                id: el.id,
                tipo: el.tipo,
                p1: el.p1 || null,
                p2: el.p2 || null,
                vertices: el.vertices || null,
                altura: el.altura || null,
                espesor: el.espesor || null,
                nivel: el.nivel || 0,
                material: el.material || null,
                automaticoHabitacion: Boolean(el.automaticoHabitacion),
                tipoTecho: el.tipoTecho || null,
                angulo: el.angulo || null,
                aberturas: Array.isArray(el.aberturas)
                    ? el.aberturas.map(abertura => ({
                        id: abertura.id,
                        tipo: abertura.tipo,
                        tipoAbertura: abertura.tipoAbertura || abertura.tipo,
                        posicionRelativa: abertura.posicionRelativa,
                        material: abertura.material || null,
                        ancho: abertura.ancho,
                        alto: abertura.alto
                    }))
                    : []
                }));

            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(datosSerializable, null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", `proyecto_construcalc_${Date.now()}.json`);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();

            mostrarNotificacion("Proyecto exportado en JSON con éxito.", "success");
        } catch (error) {
            console.error("Error al exportar JSON:", error.message);
            mostrarNotificacion("Error al exportar el proyecto.", "error");
        }
    }
}