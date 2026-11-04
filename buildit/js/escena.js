/**
 * /js/escena.js
 * Configuración y gestión del visor 3D con Three.js, cámara, luces y cuadrícula.
 */

export class Escena3D {
    /**
     * Inicializa la escena 3D en el contenedor DOM especificado.
     * @param {HTMLElement} contenedorDOM - Elemento HTML donde se montará el canvas.
     */
    constructor(contenedorDOM) {
        if (!contenedorDOM) {
            throw new Error("El contenedor DOM para la escena 3D no está definido.");
        }

        this.contenedor = contenedorDOM;
        this.escena = null;
        this.camara = null;
        this.camara3D = null;
        this.camara2D = null;
        this.modo2D = false;
        this.interaccionPincelActiva = false;
        this.tamañoVista2D = 25;
        this.renderizador = null;
        this.controles = null;
        this.cuadricula = null;
        this.anchoPasoSnap = 0.1; // 10 cm de snap por defecto
        this.snapActivo = true;

        this.inicializarEscena();
        this.inicializarLuces();
        this.inicializarCuadricula();
        this.configurarEventosResize();
        this.iniciarBucleRender();
    }

    /**
     * Configura la escena principal, la cámara y el renderizador WebGL.
     */
    inicializarEscena() {
        // 1. Escena
        this.escena = new THREE.Scene();
        this.escena.background = new THREE.Color(0xf1f5f9); // Color neutro claro por defecto

        // 2. Cámara perspectiva
        const ancho = this.contenedor.clientWidth || window.innerWidth;
        const alto = this.contenedor.clientHeight || window.innerHeight;
        this.camara = new THREE.PerspectiveCamera(45, ancho / alto, 0.1, 1000);
        this.camara.position.set(10, 15, 20);
        this.camara3D = this.camara;

        // 3. Renderizador WebGL
        this.renderizador = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderizador.setSize(ancho, alto);
        this.renderizador.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderizador.shadowMap.enabled = true;
        this.renderizador.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // Limpiar contenedor previo si existe y adjuntar canvas
        this.contenedor.innerHTML = '';
        this.contenedor.appendChild(this.renderizador.domElement);

        // 4. OrbitControls (clic derecho para rotar, central para desplazar, rueda para zoom)
        if (typeof THREE.OrbitControls !== 'undefined') {
            this.controles = new THREE.OrbitControls(this.camara, this.renderizador.domElement);
            this.controles.enableDamping = true;
            this.controles.dampingFactor = 0.05;
            this.controles.maxPolarAngle = Math.PI / 2 - 0.01; // Evitar pasar por debajo del suelo
            this.controles.target.set(0, 0, 0);
        } else {
            console.error("OrbitControls de Three.js no está disponible en el entorno global.");
        }
    }

    /**
     * Configura la iluminación ambiental y direccionales con sombras.
     */
    inicializarLuces() {
        // Luz ambiental suave
        const luzAmbiental = new THREE.AmbientLight(0xffffff, 0.6);
        this.escena.add(luzAmbiental);

        // Luz direccional simulando sol con sombras
        const luzSol = new THREE.DirectionalLight(0xffffff, 0.8);
        luzSol.position.set(20, 40, 20);
        luzSol.castShadow = true;
        luzSol.shadow.mapSize.width = 2048;
        luzSol.shadow.mapSize.height = 2048;
        luzSol.shadow.camera.near = 0.5;
        luzSol.shadow.camera.far = 100;
        
        const d = 20;
        luzSol.shadow.camera.left = -d;
        luzSol.shadow.camera.right = d;
        luzSol.shadow.camera.top = d;
        luzSol.shadow.camera.bottom = -d;
        
        this.escena.add(luzSol);
    }

    /**
     * Crea la cuadrícula métrica en el plano del suelo con subdivisiones.
     */
    inicializarCuadricula() {
        const tamañoGrid = 50; // 50 metros
        const divisiones = 500; // Cada 10 cm (0.1m)
        this.cuadricula = new THREE.GridHelper(tamañoGrid, divisiones, 0x3b82f6, 0xcbd5e1);
        this.cuadricula.position.y = 0;
        this.escena.add(this.cuadricula);

        // Plano invisible de apoyo para rayos (Raycasting)
        const planoGeometria = new THREE.PlaneGeometry(100, 100);
        planoGeometria.rotateX(-Math.PI / 2);
        const planoMaterial = new THREE.MeshBasicMaterial({ visible: false });
        this.planoSuelo = new THREE.Mesh(planoGeometria, planoMaterial);
        this.planoSuelo.name = "PlanoSuelo";
        this.escena.add(this.planoSuelo);
    }

    /**
     * Ajusta la posición de la cámara según la vista seleccionada.
     * @param {string} tipoVista - '3d' | 'planta' | 'frontal' | 'lateral'
     */
    cambiarVista(tipoVista) {
        if (!this.controles) return;

        const targetCentro = this.controles.target.clone();
        const distancia = 20;

        if (tipoVista === '2d') {
            if (!this.camara2D) {
                const aspect = this.contenedor.clientWidth / this.contenedor.clientHeight;
                this.camara2D = new THREE.OrthographicCamera(
                    -this.tamañoVista2D * aspect,
                    this.tamañoVista2D * aspect,
                    this.tamañoVista2D,
                    -this.tamañoVista2D,
                    0.1,
                    1000
                );
                this.camara2D.up.set(0, 0, -1);
            }
            const aspect = this.contenedor.clientWidth / this.contenedor.clientHeight;
            this.camara2D.left = -this.tamañoVista2D * aspect;
            this.camara2D.right = this.tamañoVista2D * aspect;
            this.camara2D.top = this.tamañoVista2D;
            this.camara2D.bottom = -this.tamañoVista2D;
            this.camara2D.updateProjectionMatrix();
            this.camara = this.camara2D;
            this.modo2D = true;
            this.camara.position.set(targetCentro.x, targetCentro.y + 50, targetCentro.z);
            this.camara.lookAt(targetCentro);
            this.controles.object = this.camara;
            this.controles.enableRotate = false;
            this.controles.enablePan = !this.interaccionPincelActiva;
            this.controles.enableZoom = true;
            this.controles.mouseButtons.LEFT = THREE.MOUSE.PAN;
            this.controles.update();
            return;
        }

        if (this.modo2D) {
            this.camara = this.camara3D;
            this.controles.object = this.camara;
            this.modo2D = false;
            this.controles.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
        }
        this.controles.enableRotate = true;
        this.controles.enablePan = !this.interaccionPincelActiva;
        this.controles.enableZoom = !this.interaccionPincelActiva;

        switch (tipoVista) {
            case 'planta':
                this.camara.position.set(targetCentro.x, targetCentro.y + distancia, targetCentro.z + 0.001);
                break;
            case 'frontal':
                this.camara.position.set(targetCentro.x, targetCentro.y + 2, targetCentro.z + distancia);
                break;
            case 'lateral':
                this.camara.position.set(targetCentro.x + distancia, targetCentro.y + 2, targetCentro.z);
                break;
            case '3d':
            default:
                this.camara.position.set(targetCentro.x + 12, targetCentro.y + 15, targetCentro.z + 18);
                break;
        }
        this.controles.update();
    }

    setInteraccionPincelActiva(estado) {
        this.interaccionPincelActiva = estado;
        if (!this.controles) return;
        this.controles.enablePan = !estado;
        this.controles.enableRotate = !this.modo2D;
        this.controles.enableZoom = this.modo2D || !estado;
    }

    /**
     * Aplica el ajuste (snap) a una coordenada si está activado.
     * @param {number} valor - Coordenada numérica.
     * @returns {number} Coordenada ajustada.
     */
    aplicarSnap(valor) {
        if (!this.snapActivo) return valor;
        return Math.round(valor / this.anchoPasoSnap) * this.anchoPasoSnap;
    }

    /**
     * Activa o desactiva la cuadrícula visual y el snap.
     * @param {boolean} estado 
     */
    setSnapActivo(estado) {
        this.snapActivo = estado;
        if (this.cuadricula) {
            this.cuadricula.visible = estado;
        }
    }

    /**
     * Maneja el redimensionamiento de la ventana y el canvas.
     */
    configurarEventosResize() {
        window.addEventListener('resize', () => {
            if (!this.contenedor || !this.camara || !this.renderizador) return;
            const ancho = this.contenedor.clientWidth;
            const alto = this.contenedor.clientHeight;
            const aspect = ancho / alto;
            this.camara3D.aspect = aspect;
            this.camara3D.updateProjectionMatrix();
            if (this.modo2D) {
                this.camara.left = -this.tamañoVista2D * aspect;
                this.camara.right = this.tamañoVista2D * aspect;
                this.camara.top = this.tamañoVista2D;
                this.camara.bottom = -this.tamañoVista2D;
                this.camara.updateProjectionMatrix();
            }
            this.renderizador.setSize(ancho, alto);
        });
    }

    /**
     * Bucle de animación y renderizado con requestAnimationFrame.
     */
    iniciarBucleRender() {
        const animar = () => {
            requestAnimationFrame(animar);
            if (this.controles) {
                this.controles.update();
            }
            if (this.renderizador && this.escena && this.camara) {
                this.renderizador.render(this.escena, this.camara);
            }
        };
        animar();
    }
}