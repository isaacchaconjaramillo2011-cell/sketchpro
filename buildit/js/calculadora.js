/**
 * /js/calculadora.js
 * Motor independiente de cálculo de cantidades, desperdicios, costos totales y alternativas por gama.
 */

import { LISTA_MATERIALES } from './materiales-datos.js';
import { redondear } from './utilidades.js';

function extraerResistencia(resistencia) {
    const texto = String(resistencia || '').trim().toLowerCase();
    const coincidencia = texto.match(/(\d+(?:[.,]\d+)?)\s*(mpa|psi)\b/);
    if (coincidencia) {
        return {
            unidad: coincidencia[2],
            valor: Number(coincidencia[1].replace(',', '.'))
        };
    }

    if (texto.startsWith('máxima') || texto.startsWith('maxima')) return { nivel: 5 };
    if (texto.startsWith('muy alta')) return { nivel: 4 };
    if (texto.startsWith('alta')) return { nivel: 3 };
    if (texto.startsWith('media')) return { nivel: 2 };
    if (texto.startsWith('baja')) return { nivel: 1 };
    return { texto };
}

function cumpleResistencia(materialCandidato, materialActual) {
    const actual = extraerResistencia(materialActual.resistencia);
    const candidato = extraerResistencia(materialCandidato.resistencia);

    if (actual.valor !== undefined && candidato.valor !== undefined) {
        return actual.unidad === candidato.unidad && candidato.valor >= actual.valor;
    }
    if (actual.nivel !== undefined && candidato.nivel !== undefined) {
        return candidato.nivel >= actual.nivel;
    }
    return actual.texto === candidato.texto;
}

function nivelDesempeno(material) {
    const resistencia = extraerResistencia(material.resistencia);
    const resistenciaNormalizada = resistencia.valor !== undefined
        ? resistencia.valor
        : resistencia.nivel || 0;
    const aislamiento = { bajo: 1, medio: 2, alto: 3 };
    const durabilidad = Number(material.durabilidadAnios) || 0;
    return resistenciaNormalizada * 10000 + durabilidad * 10
        + (aislamiento[String(material.aislamientoTermico || '').toLowerCase()] || 0);
}

export class CalculadoraPresupuesto {
    /**
     * @param {Array} elementosModelo - Lista de elementos arquitectónicos del proyecto.
     */
    constructor(elementosModelo) {
        this.elementosModelo = elementosModelo || [];
        this.soloMateriales = true;
        this.porcentajeManoObra = 0.3;
        this.modoCalculo = 'plano';
        this.materialesManuales = [];
    }

    setSoloMateriales(estado) {
        this.soloMateriales = Boolean(estado);
    }

    setModoCalculo(modo) {
        if (modo !== 'plano' && modo !== 'manual') {
            throw new Error(`Modo de cálculo no válido: ${modo}`);
        }
        this.modoCalculo = modo;
    }

    setMaterialesManuales(materiales) {
        if (!Array.isArray(materiales)) {
            throw new TypeError('Los materiales manuales deben recibirse como una lista.');
        }
        this.materialesManuales = materiales;
    }

    /**
     * Calcula las cantidades y costos detallados para un elemento específico.
     * @param {Object} elemento - Elemento del modelo (muro, piso, techo, etc.).
     * @returns {Object} Desglose de cálculo y costo.
     */
    calcularElemento(elemento) {
        try {
            if (!elemento) return { costoTotal: 0, unidadesNecesarias: 0, material: null };

            // Obtener material asignado o buscar uno por defecto según el tipo
            let material = elemento.material;
            if (!material) {
                material = this.obtenerMaterialPorDefecto(elemento.tipo);
            }

            if (!material) {
                return { costoTotal: 0, unidadesNecesarias: 0, material: null, areaReal: 0 };
            }

            let areaBruta = 0;
            let areaDescontada = 0;

            if (elemento.tipo === 'muro') {
                areaBruta = elemento.longitud * elemento.altura;
                // Descontar aberturas (puertas y ventanas)
                let areaAberturas = 0;
                if (elemento.aberturas && elemento.aberturas.length > 0) {
                    elemento.aberturas.forEach(ab => {
                        areaAberturas += (ab.ancho * ab.alto);
                    });
                }
                areaDescontada = Math.max(0, areaBruta - areaAberturas);
            } else if (elemento.tipo === 'piso' || elemento.tipo === 'techo') {
                areaDescontada = elemento.area || 15; // Área estimada base
            } else {
                areaDescontada = 1; // Elemento unitario
            }

            // Cálculo de cantidad según rendimiento y desperdicio
            let cantidadBruta = 0;
            if (material.unidad === 'm2' || material.unidad === 'm3' || material.unidad === 'galon') {
                cantidadBruta = areaDescontada / (material.rendimiento || 1);
            } else if (material.unidad === 'unidad' || material.unidad === 'bulto' || material.unidad === 'rollo') {
                // Si el rendimiento indica cuántas unidades cubren 1 m² (ej: 55 ladrillos/m²)
                if (elemento.tipo === 'muro') {
                    cantidadBruta = areaDescontada * (material.rendimiento || 1);
                } else {
                    cantidadBruta = 1;
                }
            } else {
                cantidadBruta = areaDescontada;
            }

            // Aplicar porcentaje de desperdicio
            const porcentajeDesperdicio = material.desperdicioPorcentaje || 5;
            const cantidadConDesperdicio = cantidadBruta * (1 + (porcentajeDesperdicio / 100));
            const cantidadFinal = Math.ceil(cantidadConDesperdicio); // Redondear hacia arriba a unidad de compra

            const costoTotal = redondear(cantidadFinal * material.precioUnitario, 2);

            return {
                idElemento: elemento.id,
                tipo: elemento.tipo,
                material: material,
                areaReal: redondear(areaDescontada, 2),
                cantidadNecesaria: cantidadFinal,
                unidadCompra: material.unidad,
                costoUnitario: material.precioUnitario,
                costoTotal: costoTotal
            };

        } catch (error) {
            console.error("Error al calcular elemento en calculadora:", error.message);
            return { costoTotal: 0, unidadesNecesarias: 0, material: null };
        }
    }

    /**
     * Busca un material por defecto según el tipo de elemento.
     * @param {string} tipo 
     * @returns {Object} Material del catálogo.
     */
    obtenerMaterialPorDefecto(tipo) {
        const encontrados = LISTA_MATERIALES.filter(m => {
            if (tipo === 'muro') return m.categoria === 'Muros';
            if (tipo === 'piso') return m.categoria === 'Pisos';
            if (tipo === 'techo') return m.categoria === 'Techos';
            if (tipo === 'puerta') return m.categoria === 'Puertas';
            if (tipo === 'ventana') return m.categoria === 'Ventanas';
            return false;
        });
        return encontrados.length > 0 ? encontrados[0] : LISTA_MATERIALES[0];
    }

    /**
     * Calcula el presupuesto total del proyecto agrupado por categorías.
     * @returns {Object} Presupuesto total y desglose.
     */
    calcularPresupuestoTotal(gamaObjetivo = null) {
        try {
            let costoTotalProyecto = 0;
            const desglosePorCategoria = {};

            if (this.modoCalculo === 'manual') {
                const subtotal = this.materialesManuales.reduce((total, material) =>
                    total + material.cantidad * material.precioUnitario, 0
                );
                if (this.materialesManuales.length) {
                    desglosePorCategoria['Materiales ingresados'] = {
                        costo: redondear(subtotal, 2),
                        items: this.materialesManuales.length
                    };
                }
                return { costoTotal: redondear(subtotal, 2), desglose: desglosePorCategoria };
            }

            this.elementosModelo.forEach(el => {
                let elementoCalculado = el;
                if (gamaObjetivo === 'economica') {
                    const materialActual = el.material || this.obtenerMaterialPorDefecto(el.tipo);
                    const costoActual = this.calcularElemento({ ...el, material: materialActual }).costoTotal;
                    const materialesMasBaratos = LISTA_MATERIALES
                        .filter(material =>
                            material.categoria === materialActual.categoria
                            && material.id !== materialActual.id
                            && cumpleResistencia(material, materialActual)
                        )
                        .map(material => ({
                            material,
                            costo: this.calcularElemento({ ...el, material }).costoTotal
                        }))
                        .filter(alternativa => alternativa.costo < costoActual)
                        .sort((a, b) => a.costo - b.costo);

                    if (materialesMasBaratos.length) {
                        elementoCalculado = { ...el, material: materialesMasBaratos[0].material };
                    }
                } else if (gamaObjetivo) {
                    const materialActual = el.material || this.obtenerMaterialPorDefecto(el.tipo);
                    const materialAlternativo = LISTA_MATERIALES.find(material =>
                        material.categoria === materialActual.categoria
                        && material.id !== materialActual.id
                        && cumpleResistencia(material, materialActual)
                        && nivelDesempeno(material) > nivelDesempeno(materialActual)
                        && material.gama === gamaObjetivo
                    );
                    if (materialAlternativo) elementoCalculado = { ...el, material: materialAlternativo };
                }

                const calculo = this.calcularElemento(elementoCalculado);
                if (calculo && calculo.material) {
                    const cat = calculo.material.categoria || 'Otros';
                    costoTotalProyecto += calculo.costoTotal;

                    if (!desglosePorCategoria[cat]) {
                        desglosePorCategoria[cat] = { costo: 0, items: 0 };
                    }
                    desglosePorCategoria[cat].costo += calculo.costoTotal;
                    desglosePorCategoria[cat].items += 1;
                }
            });

            if (!this.soloMateriales && costoTotalProyecto > 0) {
                const costoManoObra = redondear(costoTotalProyecto * this.porcentajeManoObra, 2);
                costoTotalProyecto += costoManoObra;
                desglosePorCategoria['Mano de obra'] = {
                    costo: costoManoObra,
                    items: 0,
                    esServicio: true
                };
            }

            return {
                costoTotal: redondear(costoTotalProyecto, 2),
                desglose: desglosePorCategoria
            };
        } catch (error) {
            console.error("Error al calcular presupuesto total:", error.message);
            return { costoTotal: 0, desglose: {} };
        }
    }

    obtenerPropuestaAlternativa(gamaObjetivo) {
        if (gamaObjetivo !== 'economica' && gamaObjetivo !== 'premium') {
            throw new Error(`Alternativa no válida: ${gamaObjetivo}`);
        }

        const calculosActuales = this.elementosModelo.map(elemento => {
            const material = elemento.material || this.obtenerMaterialPorDefecto(elemento.tipo);
            return {
                elemento,
                material,
                calculo: this.calcularElemento({ ...elemento, material })
            };
        });
        const totalMaterialesActual = redondear(
            calculosActuales.reduce((total, item) => total + item.calculo.costoTotal, 0),
            2
        );
        const factorCosto = this.soloMateriales ? 1 : 1 + this.porcentajeManoObra;
        const totalActual = redondear(totalMaterialesActual * factorCosto, 2);
        const cambios = [];

        calculosActuales.forEach(({ elemento, material, calculo }) => {
            if (!material || !calculo.material) return;
            const candidatos = LISTA_MATERIALES
                .filter(candidato =>
                    candidato.categoria === material.categoria
                    && candidato.id !== material.id
                    && cumpleResistencia(candidato, material)
                )
                .map(candidato => ({
                    material: candidato,
                    calculo: this.calcularElemento({ ...elemento, material: candidato })
                }))
                .filter(candidato => candidato.calculo.material);

            const viables = gamaObjetivo === 'economica'
                ? candidatos
                    .filter(candidato => candidato.calculo.costoTotal < calculo.costoTotal)
                    .sort((a, b) => a.calculo.costoTotal - b.calculo.costoTotal)
                : candidatos
                    .filter(candidato =>
                        nivelDesempeno(candidato.material) > nivelDesempeno(material)
                        && candidato.calculo.costoTotal > calculo.costoTotal
                    )
                    .sort((a, b) =>
                        nivelDesempeno(b.material) - nivelDesempeno(a.material)
                        || a.calculo.costoTotal - b.calculo.costoTotal
                    );

            if (!viables.length) return;
            const opcion = viables[0];
            cambios.push({
                idElemento: elemento.id,
                tipo: elemento.tipo,
                materialActual: material,
                materialPropuesto: opcion.material,
                cantidadActual: calculo.cantidadNecesaria,
                unidadActual: calculo.unidadCompra,
                costoActual: calculo.costoTotal,
                cantidadPropuesta: opcion.calculo.cantidadNecesaria,
                unidadPropuesta: opcion.calculo.unidadCompra,
                costoPropuesto: opcion.calculo.costoTotal,
                resistenciaActual: material.resistencia || 'No especificada',
                resistenciaPropuesta: opcion.material.resistencia || 'No especificada'
            });
        });

        const totalPropuesto = redondear(
            (totalMaterialesActual + cambios.reduce((total, cambio) =>
                total + cambio.costoPropuesto - cambio.costoActual, 0
            )) * factorCosto,
            2
        );

        return {
            gama: gamaObjetivo,
            totalActual,
            totalPropuesto,
            ahorro: redondear(totalActual - totalPropuesto, 2),
            factorCosto,
            elementosAnalizados: calculosActuales.length,
            cambios
        };
    }

    /**
     * Simula el cambio de todo el proyecto a una gama específica ('economica' | 'media' | 'premium').
     * @param {string} gamaObjetivo 
     * @returns {number} Costo total simulado.
     */
    recalcularConGama(gamaObjetivo) {
        try {
            if (this.modoCalculo === 'manual') {
                return this.calcularPresupuestoTotal().costoTotal;
            }
            return this.calcularPresupuestoTotal(gamaObjetivo).costoTotal;
        } catch (error) {
            console.error("Error al recalcular con gama:", error.message);
            return 0;
        }
    }

    /**
     * Ejecuta la prueba de ejemplo requerida:
     * Una pared de 4x2.5 m con una puerta de 0.9x2.1 m usando Ladrillo Tolete Común.
     */
    static ejecutarPruebaEjemploMuro() {
        console.group("=== PRUEBA DE EJEMPLO: Muro 4x2.5m con Puerta 0.9x2.1m ===");
        
        const materialPrueba = LISTA_MATERIALES.find(m => m.id === 'muro-ladrillo-comun');
        console.log(`Material: ${materialPrueba.nombre}`);
        console.log(`- Precio Unitario: $${materialPrueba.precioUnitario.toLocaleString('es-CO')} COP / ${materialPrueba.unidad}`);
        console.log(`- Rendimiento: ${materialPrueba.rendimiento} unidades / m²`);
        console.log(`- Desperdicio: ${materialPrueba.desperdicioPorcentaje}%`);

        const largoMuro = 4.0;
        const altoMuro = 2.5;
        const areaBruta = largoMuro * altoMuro;
        console.log(`Paso 1: Área bruta del muro = ${largoMuro}m × ${altoMuro}m = ${areaBruta.toFixed(2)} m²`);

        const anchoPuerta = 0.9;
        const altoPuerta = 2.1;
        const areaPuerta = anchoPuerta * altoPuerta;
        console.log(`Paso 2: Área de la puerta (hueco a descontar) = ${anchoPuerta}m × ${altoPuerta}m = ${areaPuerta.toFixed(2)} m²`);

        const areaNeta = areaBruta - areaPuerta;
        console.log(`Paso 3: Área neta del muro = ${areaBruta.toFixed(2)} - ${areaPuerta.toFixed(2)} = ${areaNeta.toFixed(2)} m²`);

        const cantidadBruta = areaNeta * materialPrueba.rendimiento;
        const cantidadConDesperdicio = cantidadBruta * (1 + (materialPrueba.desperdicioPorcentaje / 100));
        const cantidadFinal = Math.ceil(cantidadConDesperdicio);
        console.log(`Paso 4: Cantidad bruta (${areaNeta.toFixed(2)} m² × ${materialPrueba.rendimiento}) = ${cantidadBruta.toFixed(2)} unidades`);
        console.log(`Paso 5: Con ${materialPrueba.desperdicioPorcentaje}% de desperdicio = ${cantidadConDesperdicio.toFixed(2)} -> Redondeo hacia arriba: ${cantidadFinal} unidades`);

        const costoTotal = cantidadFinal * materialPrueba.precioUnitario;
        console.log(`Paso 6: Costo Total = ${cantidadFinal} unidades × $${materialPrueba.precioUnitario.toLocaleString('es-CO')} = $${costoTotal.toLocaleString('es-CO')} COP`);
        console.groupEnd();

        return {
            areaNeta: redondear(areaNeta, 2),
            cantidadFinal,
            costoTotal
        };
    }
}