/**
 * /js/elementos.js
 * Creación y manipulación modular de elementos arquitectónicos 3D (muros, pisos, techos, puertas, ventanas).
 */

function copiarDatosMaterial(materialData) {
    return materialData ? { ...materialData } : null;
}

export const CONFIGURACION_ABERTURAS = {
    puerta: { tipo: 'puerta', ancho: 0.9, alto: 2.1, elevacion: 0 },
    'puerta-doble': { tipo: 'puerta', ancho: 1.5, alto: 2.1, elevacion: 0 },
    'puerta-corredera': { tipo: 'puerta', ancho: 1.8, alto: 2.1, elevacion: 0 },
    'ventana-fija': { tipo: 'ventana', ancho: 1.2, alto: 1.0, elevacion: 0.9 },
    'ventana-corredera': { tipo: 'ventana', ancho: 1.5, alto: 1.2, elevacion: 0.7 },
    'porton-garaje': { tipo: 'puerta', ancho: 2.8, alto: 2.4, elevacion: 0 }
};

export class GestorElementos {
    /**
     * @param {THREE.Scene} escena - Instancia de la escena Three.js.
     */
    constructor(escena) {
        if (!escena) {
            throw new Error("Se requiere una instancia de la escena Three.js para el gestor de elementos.");
        }
        this.escena = escena;
        this.elementosModelo = []; // Lista de objetos lógicos y sus referencias 3D
    }

    /**
     * Crea un muro 3D basado en dos puntos (inicio y fin), altura y espesor.
     * @param {Object} p1 - {x, z} Punto inicial.
     * @param {Object} p2 - {x, z} Punto final.
     * @param {number} altura - Altura del muro en metros (ej: 2.8).
     * @param {number} espesor - Espesor del muro en metros (ej: 0.15).
     * @param {Object} materialData - Objeto de datos del material (catálogo).
     * @param {number} nivel - Nivel de construcción (0, 1, ...).
     * @returns {Object} Objeto elemento creado.
     */
    crearMuro(p1, p2, altura = 2.8, espesor = 0.15, materialData = null, nivel = 0) {
        try {
            const dx = p2.x - p1.x;
            const dz = p2.z - p1.z;
            const longitud = Math.sqrt(dx * dx + dz * dz);

            if (longitud < 0.05) {
                throw new Error("El muro es demasiado corto para ser creado.");
            }

            // Geometría del muro centrada en su eje
            const geometria = new THREE.BoxGeometry(espesor, altura, longitud);
            
            // Material visual Three.js
            const colorHex = materialData && materialData.color ? materialData.color : '#b2533e';
            const material3D = new THREE.MeshStandardMaterial({
                color: new THREE.Color(colorHex),
                roughness: 0.8,
                metalness: 0.1
            });

            const malla = new THREE.Mesh(geometria, material3D);
            malla.castShadow = true;
            malla.receiveShadow = true;

            // Posicionamiento en el punto medio entre p1 y p2
            const posX = (p1.x + p2.x) / 2;
            const posZ = (p1.z + p2.z) / 2;
            const posY = (altura / 2) + (nivel * 3.0); // 3 metros por nivel

            malla.position.set(posX, posY, posZ);

            // Rotación orientada hacia el punto fin
            const angulo = Math.atan2(dx, dz);
            malla.rotation.y = angulo;

            this.escena.add(malla);

            const elementoMuro = {
                id: 'muro_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                tipo: 'muro',
                p1: { ...p1 },
                p2: { ...p2 },
                longitud: longitud,
                altura: altura,
                espesor: espesor,
                nivel: nivel,
                material: copiarDatosMaterial(materialData),
                malla: malla,
                aberturas: [] // Puertas o ventanas insertadas
            };

            this.elementosModelo.push(elementoMuro);
            return elementoMuro;

        } catch (error) {
            console.error("Error al crear el muro:", error.message);
            return null;
        }
    }

    /**
     * Crea un piso o losa 3D basado en una lista de vértices (polígono).
     * @param {Array} vertices - [{x, z}, ...] vértices del polígono.
     * @param {number} espesor - Espesor de la losa (ej: 0.2m).
     * @param {Object} materialData - Datos del material de piso.
     * @param {number} nivel - Nivel de construcción.
     * @returns {Object} Objeto elemento de piso creado.
     */
    crearPiso(vertices, espesor = 0.2, materialData = null, nivel = 0) {
        try {
            if (!vertices || vertices.length < 3) {
                throw new Error("Se requieren al menos 3 vértices para formar un piso.");
            }

            const formaPoligono = new THREE.Shape();
            vertices.forEach((v, index) => {
                if (index === 0) formaPoligono.moveTo(v.x, v.z);
                else formaPoligono.lineTo(v.x, v.z);
            });

            const opcionesExtrusion = {
                steps: 1,
                depth: espesor,
                bevelEnabled: false
            };

            const geometria = new THREE.ExtrudeGeometry(formaPoligono, opcionesExtrusion);
            geometria.rotateX(Math.PI / 2); // Alinear horizontalmente en el plano XZ

            const material3D = new THREE.MeshStandardMaterial({
                color: new THREE.Color('#475569'),
                roughness: 0.85,
                metalness: 0
            });

            const malla = new THREE.Mesh(geometria, material3D);
            malla.position.y = (nivel * 3.0) + 0.01;
            malla.receiveShadow = true;

            this.escena.add(malla);

            const areaAproximada = Math.abs(vertices.reduce((area, vertice, index) => {
                const siguiente = vertices[(index + 1) % vertices.length];
                return area + vertice.x * siguiente.z - siguiente.x * vertice.z;
            }, 0) / 2);

            const elementoPiso = {
                id: 'piso_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                tipo: 'piso',
                vertices: [...vertices],
                espesor: espesor,
                nivel: nivel,
                area: areaAproximada,
                material: copiarDatosMaterial(materialData),
                malla: malla
            };

            this.elementosModelo.push(elementoPiso);
            return elementoPiso;

        } catch (error) {
            console.error("Error al crear el piso:", error.message);
            return null;
        }
    }

    detectarHabitacionesCerradas(nivel) {
        const nodos = new Map();
        const adyacencias = new Map();
        const clavePunto = punto => `${Math.round(punto.x * 100)},${Math.round(punto.z * 100)}`;
        const segmentos = this.elementosModelo
            .filter(muro => muro.tipo === 'muro' && muro.nivel === nivel)
            .map(muro => ({ inicio: muro.p1, fin: muro.p2, puntos: [muro.p1, muro.p2] }));
        const extremos = segmentos.flatMap(segmento => [segmento.inicio, segmento.fin]);
        const puntoEnSegmento = (punto, segmento) => {
            const dx = segmento.fin.x - segmento.inicio.x;
            const dz = segmento.fin.z - segmento.inicio.z;
            const longitudCuadrada = dx * dx + dz * dz;
            if (!longitudCuadrada) return null;
            const t = ((punto.x - segmento.inicio.x) * dx + (punto.z - segmento.inicio.z) * dz)
                / longitudCuadrada;
            if (t <= 0.0001 || t >= 0.9999) return null;
            const x = segmento.inicio.x + dx * t;
            const z = segmento.inicio.z + dz * t;
            return Math.hypot(punto.x - x, punto.z - z) <= 0.015 ? { x, z, t } : null;
        };

        segmentos.forEach(segmento => {
            extremos.forEach(extremo => {
                const punto = puntoEnSegmento(extremo, segmento);
                if (punto) segmento.puntos.push({ x: punto.x, z: punto.z });
            });
        });
        for (let indice = 0; indice < segmentos.length; indice += 1) {
            const primero = segmentos[indice];
            const rx = primero.fin.x - primero.inicio.x;
            const rz = primero.fin.z - primero.inicio.z;
            for (let otroIndice = indice + 1; otroIndice < segmentos.length; otroIndice += 1) {
                const segundo = segmentos[otroIndice];
                const sx = segundo.fin.x - segundo.inicio.x;
                const sz = segundo.fin.z - segundo.inicio.z;
                const denominador = rx * sz - rz * sx;
                if (Math.abs(denominador) < 1e-8) continue;
                const qx = segundo.inicio.x - primero.inicio.x;
                const qz = segundo.inicio.z - primero.inicio.z;
                const t = (qx * sz - qz * sx) / denominador;
                const u = (qx * rz - qz * rx) / denominador;
                if (t < 0 || t > 1 || u < 0 || u > 1) continue;
                const interseccion = {
                    x: primero.inicio.x + rx * t,
                    z: primero.inicio.z + rz * t
                };
                primero.puntos.push(interseccion);
                segundo.puntos.push(interseccion);
            }
        }

        segmentos.forEach(segmento => {
            const dx = segmento.fin.x - segmento.inicio.x;
            const dz = segmento.fin.z - segmento.inicio.z;
            const longitudCuadrada = dx * dx + dz * dz;
            const puntosOrdenados = new Map();
            segmento.puntos.forEach(punto => {
                const t = ((punto.x - segmento.inicio.x) * dx + (punto.z - segmento.inicio.z) * dz)
                    / longitudCuadrada;
                puntosOrdenados.set(clavePunto(punto), { x: punto.x, z: punto.z, t });
            });
            const puntos = [...puntosOrdenados.entries()].sort((a, b) => a[1].t - b[1].t);
            for (let indice = 0; indice < puntos.length - 1; indice += 1) {
                const [claveInicio, puntoInicio] = puntos[indice];
                const [claveFin, puntoFin] = puntos[indice + 1];
                if (claveInicio === claveFin) continue;
                nodos.set(claveInicio, { x: puntoInicio.x, z: puntoInicio.z });
                nodos.set(claveFin, { x: puntoFin.x, z: puntoFin.z });
                if (!adyacencias.has(claveInicio)) adyacencias.set(claveInicio, new Set());
                if (!adyacencias.has(claveFin)) adyacencias.set(claveFin, new Set());
                adyacencias.get(claveInicio).add(claveFin);
                adyacencias.get(claveFin).add(claveInicio);
            }
        });

        const visitadas = new Set();
        const habitaciones = [];
        for (const [inicio, vecinos] of adyacencias) {
            for (const vecinoInicial of vecinos) {
                const claveDirigidaInicial = `${inicio}>${vecinoInicial}`;
                if (visitadas.has(claveDirigidaInicial)) continue;

                const vertices = [];
                let origen = inicio;
                let destino = vecinoInicial;
                let cerrada = false;
                for (let paso = 0; paso < 200; paso += 1) {
                    const claveDirigida = `${origen}>${destino}`;
                    if (visitadas.has(claveDirigida)) break;
                    visitadas.add(claveDirigida);
                    vertices.push(nodos.get(origen));

                    const opciones = [...adyacencias.get(destino)].sort((a, b) => {
                        const puntoDestino = nodos.get(destino);
                        const puntoA = nodos.get(a);
                        const puntoB = nodos.get(b);
                        return Math.atan2(puntoA.z - puntoDestino.z, puntoA.x - puntoDestino.x)
                            - Math.atan2(puntoB.z - puntoDestino.z, puntoB.x - puntoDestino.x);
                    });
                    const indiceRetorno = opciones.indexOf(origen);
                    if (indiceRetorno < 0 || !opciones.length) break;
                    const siguiente = opciones[(indiceRetorno - 1 + opciones.length) % opciones.length];
                    origen = destino;
                    destino = siguiente;
                    if (origen === inicio && destino === vecinoInicial) {
                        cerrada = true;
                        break;
                    }
                }

                if (!cerrada || vertices.length < 3) continue;
                const areaFirmada = vertices.reduce((area, vertice, indice) => {
                    const siguiente = vertices[(indice + 1) % vertices.length];
                    return area + vertice.x * siguiente.z - siguiente.x * vertice.z;
                }, 0) / 2;
                if (areaFirmada < 0.01) continue;
                habitaciones.push(vertices);
            }
        }
        return habitaciones;
    }

    crearPisosEnHabitaciones(materialData, nivel) {
        const clavePoligono = vertices => {
            const puntos = vertices.map(punto => `${Math.round(punto.x * 100)},${Math.round(punto.z * 100)}`);
            const variantes = [];
            for (const secuencia of [puntos, [...puntos].reverse()]) {
                for (let indice = 0; indice < secuencia.length; indice += 1) {
                    variantes.push([...secuencia.slice(indice), ...secuencia.slice(0, indice)].join('|'));
                }
            }
            return variantes.sort()[0];
        };
        const habitaciones = this.detectarHabitacionesCerradas(nivel);
        const clavesHabitaciones = new Set(habitaciones.map(clavePoligono));
        this.elementosModelo
            .filter(elemento => elemento.tipo === 'piso'
                && elemento.nivel === nivel
                && elemento.automaticoHabitacion
                && !clavesHabitaciones.has(clavePoligono(elemento.vertices)))
            .map(elemento => elemento.id)
            .forEach(id => this.eliminarElemento(id));

        const pisosExistentes = new Set(this.elementosModelo
            .filter(elemento => elemento.tipo === 'piso' && elemento.nivel === nivel)
            .map(elemento => clavePoligono(elemento.vertices)));
        const pisosDelNivel = this.elementosModelo
            .filter(elemento => elemento.tipo === 'piso' && elemento.nivel === nivel);
        const puntoDentroDelPiso = (punto, vertices) => {
            let dentro = false;
            for (let indice = 0, anterior = vertices.length - 1; indice < vertices.length; anterior = indice++) {
                const actual = vertices[indice];
                const previo = vertices[anterior];
                const dx = actual.x - previo.x;
                const dz = actual.z - previo.z;
                const cruzado = dx * (punto.z - previo.z) - dz * (punto.x - previo.x);
                const proyeccion = (punto.x - previo.x) * dx + (punto.z - previo.z) * dz;
                if (Math.abs(cruzado) <= 0.01 && proyeccion >= -0.01 && proyeccion <= dx * dx + dz * dz + 0.01) {
                    return true;
                }
                if ((actual.z > punto.z) !== (previo.z > punto.z)
                    && punto.x < ((previo.x - actual.x) * (punto.z - actual.z)
                        / (previo.z - actual.z)) + actual.x) {
                    dentro = !dentro;
                }
            }
            return dentro;
        };
        const creados = [];

        for (const vertices of habitaciones) {
            const clave = clavePoligono(vertices);
            if (
                pisosExistentes.has(clave)
                || pisosDelNivel.some(piso => vertices.every(punto => puntoDentroDelPiso(punto, piso.vertices)))
            ) {
                continue;
            }
            const piso = this.crearPiso(vertices, 0.2, materialData, nivel);
            if (piso) {
                piso.automaticoHabitacion = true;
                pisosExistentes.add(clave);
                pisosDelNivel.push(piso);
                creados.push(piso);
            }
        }
        return creados;
    }

    /**
     * Crea un techo plano o a dos aguas.
     * @param {Array} vertices - Vértices base del techo.
     * @param {string} tipoTecho - 'plano' | 'dos_aguas'.
     * @param {number} angulo - Ángulo de inclinación en grados.
     * @param {number} nivel - Nivel de construcción.
     * @param {Object} materialData - Datos del material de techo.
     * @returns {Object} Elemento de techo creado.
     */
    crearTecho(vertices, tipoTecho = 'plano', angulo = 15, nivel = 0, materialData = null, espesor = 0.2) {
        try {
            const alturaBase = 2.8 + (nivel * 3.0);
            if (!vertices || vertices.length < 3) {
                throw new Error("Se requieren al menos 3 vértices para formar un techo.");
            }

            const formaPoligono = new THREE.Shape();
            vertices.forEach((v, index) => {
                if (index === 0) formaPoligono.moveTo(v.x, v.z);
                else formaPoligono.lineTo(v.x, v.z);
            });
            const geometria = new THREE.ExtrudeGeometry(formaPoligono, {
                steps: 1,
                depth: espesor,
                bevelEnabled: false
            });
            geometria.rotateX(Math.PI / 2);

            const colorHex = materialData && materialData.color ? materialData.color : '#993d22';
            const material3D = new THREE.MeshStandardMaterial({
                color: new THREE.Color(colorHex),
                roughness: 0.7
            });

            const malla = new THREE.Mesh(geometria, material3D);
            malla.position.y = alturaBase;
            malla.castShadow = true;

            this.escena.add(malla);

            const elementoTecho = {
                id: 'techo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                tipo: 'techo',
                tipoTecho: tipoTecho,
                angulo: angulo,
                nivel: nivel,
                vertices: [...vertices],
                espesor: espesor,
                material: copiarDatosMaterial(materialData),
                malla: malla
            };

            this.elementosModelo.push(elementoTecho);
            return elementoTecho;

        } catch (error) {
            console.error("Error al crear el techo:", error.message);
            return null;
        }
    }

    /**
     * Inserta una puerta o ventana sobre un muro existente.
     * @param {Object} muroElemento - Referencia al muro en el modelo.
     * @param {string} tipoAbertura - Variante de puerta, ventana o portón.
     * @param {number} posicionRelativa - Distancia a lo largo del muro (0 a 1).
     * @param {Object} materialData - Material específico.
     * @returns {Object} Objeto abertura creado.
     */
    crearAberturaEnMuro(muroElemento, tipoAbertura = 'puerta', posicionRelativa = 0.5, materialData = null, dimensiones = {}) {
        try {
            if (!muroElemento || muroElemento.tipo !== 'muro') {
                throw new Error("Debe asociar la abertura a un muro válido.");
            }

            const variante = CONFIGURACION_ABERTURAS[tipoAbertura]
                || CONFIGURACION_ABERTURAS[tipoAbertura === 'ventana' ? 'ventana-fija' : 'puerta'];
            const tipo = variante.tipo;
            const ancho = dimensiones.ancho || variante.ancho;
            const alto = dimensiones.alto || variante.alto;
            const longitudMuro = Math.hypot(
                muroElemento.p2.x - muroElemento.p1.x,
                muroElemento.p2.z - muroElemento.p1.z
            );
            if (ancho > longitudMuro) {
                throw new Error('La abertura no cabe en este muro.');
            }
            const desplazamientoMinimo = ancho / (2 * longitudMuro);
            posicionRelativa = Math.max(
                desplazamientoMinimo,
                Math.min(1 - desplazamientoMinimo, posicionRelativa)
            );

            const geometria = new THREE.BoxGeometry(muroElemento.espesor * 1.2, alto, ancho);
            const colorHex = materialData && materialData.color ? materialData.color : (tipo === 'puerta' ? '#d97706' : '#94a3b8');
            
            const material3D = new THREE.MeshStandardMaterial({
                color: new THREE.Color(colorHex),
                roughness: 0.5,
                transparent: true,
                opacity: tipo === 'ventana' ? 0.7 : 1.0
            });

            const malla = new THREE.Mesh(geometria, material3D);

            // Calcular posición interpolada a lo largo del muro
            const p1 = muroElemento.p1;
            const p2 = muroElemento.p2;
            const posX = p1.x + (p2.x - p1.x) * posicionRelativa;
            const posZ = p1.z + (p2.z - p1.z) * posicionRelativa;
            const basePosY = (muroElemento.nivel * 3.0) + (alto / 2) + variante.elevacion;

            malla.position.set(posX, basePosY, posZ);
            malla.rotation.y = muroElemento.malla.rotation.y;

            this.escena.add(malla);

            const abertura = {
                id: tipoAbertura + '_' + Date.now(),
                tipo,
                tipoAbertura,
                ancho: ancho,
                alto: alto,
                nivel: muroElemento.nivel,
                posicionRelativa: posicionRelativa,
                material: copiarDatosMaterial(materialData),
                malla: malla
            };

            muroElemento.aberturas.push(abertura);
            this.elementosModelo.push(abertura);
            return abertura;

        } catch (error) {
            console.error("Error al crear abertura en muro:", error.message);
            return null;
        }
    }

    crearInstantanea() {
        return this.elementosModelo
            .filter(elemento => elemento.tipo !== 'puerta' && elemento.tipo !== 'ventana')
            .map(elemento => {
                const datos = {
                    id: elemento.id,
                    tipo: elemento.tipo,
                    nivel: elemento.nivel,
                    material: copiarDatosMaterial(elemento.material),
                    aberturas: []
                };

                if (elemento.tipo === 'muro') {
                    datos.p1 = { ...elemento.p1 };
                    datos.p2 = { ...elemento.p2 };
                    datos.altura = elemento.altura;
                    datos.espesor = elemento.espesor;
                    datos.aberturas = elemento.aberturas.map(abertura => ({
                        id: abertura.id,
                        tipo: abertura.tipo,
                        tipoAbertura: abertura.tipoAbertura || abertura.tipo,
                        posicionRelativa: abertura.posicionRelativa,
                        material: copiarDatosMaterial(abertura.material),
                        ancho: abertura.ancho,
                        alto: abertura.alto
                    }));
                } else {
                    datos.vertices = elemento.vertices.map(vertice => ({ ...vertice }));
                    datos.espesor = elemento.espesor;
                    datos.automaticoHabitacion = Boolean(elemento.automaticoHabitacion);
                    if (elemento.tipo === 'techo') {
                        datos.tipoTecho = elemento.tipoTecho;
                        datos.angulo = elemento.angulo;
                    }
                }

                return datos;
            });
    }

    restaurarInstantanea(instantanea) {
        for (const elemento of this.elementosModelo) {
            if (!elemento.malla) continue;
            this.escena.remove(elemento.malla);
            if (elemento.malla.geometry) elemento.malla.geometry.dispose();
            if (elemento.malla.material) elemento.malla.material.dispose();
        }
        this.elementosModelo.length = 0;

        for (const datos of instantanea) {
            let elemento;
            if (datos.tipo === 'muro') {
                elemento = this.crearMuro(
                    datos.p1,
                    datos.p2,
                    datos.altura,
                    datos.espesor,
                    datos.material,
                    datos.nivel
                );
            } else if (datos.tipo === 'piso') {
                elemento = this.crearPiso(datos.vertices, datos.espesor, datos.material, datos.nivel);
            } else if (datos.tipo === 'techo') {
                elemento = this.crearTecho(
                    datos.vertices,
                    datos.tipoTecho,
                    datos.angulo,
                    datos.nivel,
                    datos.material,
                    datos.espesor
                );
            }

            if (!elemento) {
                throw new Error(`No se pudo restaurar el elemento ${datos.id}.`);
            }
            elemento.id = datos.id;
            elemento.automaticoHabitacion = Boolean(datos.automaticoHabitacion);

            if (datos.tipo === 'muro') {
                for (const datosAbertura of datos.aberturas) {
                    const abertura = this.crearAberturaEnMuro(
                        elemento,
                        datosAbertura.tipoAbertura || datosAbertura.tipo,
                        datosAbertura.posicionRelativa,
                        datosAbertura.material,
                        datosAbertura
                    );
                    if (!abertura) {
                        throw new Error(`No se pudo restaurar la abertura ${datosAbertura.id}.`);
                    }
                    abertura.id = datosAbertura.id;
                }
            }
        }
    }

    /**
     * Elimina un elemento del visor 3D y del modelo de datos.
     * @param {string} idElemento - ID único del elemento.
     */
    eliminarElemento(idElemento) {
        const index = this.elementosModelo.findIndex(el => el.id === idElemento);
        if (index !== -1) {
            const elemento = this.elementosModelo[index];
            const elementosEliminar = elemento.tipo === 'muro'
                ? [elemento, ...elemento.aberturas]
                : [elemento];

            for (const elementoEliminar of elementosEliminar) {
                if (elementoEliminar.malla) {
                    this.escena.remove(elementoEliminar.malla);
                    if (elementoEliminar.malla.geometry) elementoEliminar.malla.geometry.dispose();
                    if (elementoEliminar.malla.material) elementoEliminar.malla.material.dispose();
                }
                const indiceModelo = this.elementosModelo.indexOf(elementoEliminar);
                if (indiceModelo !== -1) this.elementosModelo.splice(indiceModelo, 1);
            }

            if (elemento.tipo === 'puerta' || elemento.tipo === 'ventana') {
                const muroPadre = this.elementosModelo.find(muro =>
                    muro.tipo === 'muro' && muro.aberturas.includes(elemento)
                );
                if (muroPadre) {
                    muroPadre.aberturas = muroPadre.aberturas.filter(abertura => abertura !== elemento);
                }
            }
            return true;
        }
        return false;
    }
}