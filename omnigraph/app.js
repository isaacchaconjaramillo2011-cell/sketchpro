'use strict';

/* ==========================================================
   1. ESTADO GLOBAL Y GESTIÓN DE MODELO
   ================================================---------- */
const COLORS = ['#526fd1', '#d26369', '#27876c', '#c18732', '#8566c5', '#358da0', '#cc744b', '#b8578b'];
let colorIndex = 0;

const State = {
    objects: [],
    history: [],
    redoStack: [],
    camera: {
        centerX: 0,
        centerY: 0,
        scale: 50
    },
    interaction: {
        isDragging: false,
        startX: 0,
        startY: 0
    }
};

function generateId() {
    return `obj_${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 11)}`;
}

function getNextColor() {
    const color = COLORS[colorIndex % COLORS.length];
    colorIndex++;
    return color;
}

/* ==========================================================
   2. MOTOR MATEMÁTICO Y PARSER
   ================================================---------- */
const MathEngine = {
    preprocessExpression(expr) {
        if (!expr || typeof expr !== 'string') return '';
        return expr.trim()
            .replace(/(\d)([a-zA-Z(])/g, (match, digit, next, offset, source) => {
                if (next.toLowerCase() === 'e' && /^[+-]?\d/.test(source.slice(offset + match.length))) {
                    return match;
                }
                return `${digit}*${next}`;
            })
            .replace(/([x)])\s*([a-zA-Z(])/g, '$1*$2')
            .replace(/\)\s*\(/g, ')*(');
    },

    compile(expr, scope = {}) {
        try {
            const processed = this.preprocessExpression(expr);
            const parsed = math.parse(processed);
            const compiled = parsed.compile();
            return { compiled, error: null };
        } catch (err) {
            return { compiled: null, error: err instanceof Error ? err.message : String(err) };
        }
    },

    evaluate(expr, scope = {}) {
        try {
            const processed = this.preprocessExpression(expr);
            const result = math.evaluate(processed, scope);
            if (typeof result !== 'number' || !Number.isFinite(result)) {
                return { value: null, error: 'La expresión no devuelve un número real finito.' };
            }
            return { value: result, error: null };
        } catch (err) {
            return { value: null, error: err instanceof Error ? err.message : String(err) };
        }
    }
};

/* ==========================================================
   3. GRAFO DE DEPENDENCIAS Y EVALUACIÓN TOPOLÓGICA
   ================================================---------- */
const DependencyGraph = {
    detectCycle(objects) {
        const adj = new Map();
        objects.forEach(obj => adj.set(obj.id, obj.dependeDe || []));

        const visited = new Set();
        const tempMark = new Set();

        function visit(id) {
            if (tempMark.has(id)) return true;
            if (visited.has(id)) return false;

            tempMark.add(id);
            const deps = adj.get(id) || [];
            for (const depId of deps) {
                if (visit(depId)) return true;
            }
            tempMark.delete(id);
            visited.add(id);
            return false;
        }

        for (const obj of objects) {
            if (visit(obj.id)) return true;
        }
        return false;
    },

    sortTopological(objects) {
        const map = new Map(objects.map(o => [o.id, o]));
        const visited = new Set();
        const temp = new Set();
        const order = [];

        function visit(id) {
            if (temp.has(id)) throw new Error('Dependencia circular detectada');
            if (!visited.has(id)) {
                temp.add(id);
                const obj = map.get(id);
                if (obj && obj.dependeDe) {
                    for (const depId of obj.dependeDe) {
                        visit(depId);
                    }
                }
                temp.delete(id);
                visited.add(id);
                if (obj) order.push(obj);
            }
        }

        for (const obj of objects) {
            visit(obj.id);
        }
        return order;
    }
};

/* ==========================================================
   4. GEOMETRÍA PURA E INTERSECCIONES
   ================================================---------- */
const Geometry = {
    distance(p1, p2) {
        return Math.hypot(p2.x - p1.x, p2.y - p1.y);
    },

    intersectLines(l1, l2) {
        if (![l1.a, l1.b, l1.c, l2.a, l2.b, l2.c].every(Number.isFinite)) return [];
        const det = l1.a * l2.b - l2.a * l1.b;
        if (Math.abs(det) < 1e-9) return [];
        const x = (l2.b * l1.c - l1.b * l2.c) / det;
        const y = (l1.a * l2.c - l2.a * l1.c) / det;
        return [{ x, y }];
    },

    intersectLineCircle(line, circle) {
        const { a, b, c } = line;
        const { cx, cy, r } = circle;
        const lineMagnitude = Math.hypot(a, b);
        if (![a, b, c, cx, cy, r].every(Number.isFinite) || lineMagnitude < 1e-9 || r < 0) return [];
        const dist = Math.abs(a * cx + b * cy - c) / lineMagnitude;
        if (dist > r + 1e-9) return [];

        const x0 = (b * (b * cx - a * cy) + a * c) / (a * a + b * b);
        const y0 = (a * (a * cy - b * cx) + b * c) / (a * a + b * b);

        if (Math.abs(dist - r) < 1e-7) {
            return [{ x: x0, y: y0 }];
        }

        const d = Math.sqrt(r * r - dist * dist);
        const mult = d / Math.hypot(a, b);
        return [
            { x: x0 + b * mult, y: y0 - a * mult },
            { x: x0 - b * mult, y: y0 + a * mult }
        ];
    },

    intersectCircles(c1, c2) {
        if (![c1.cx, c1.cy, c1.r, c2.cx, c2.cy, c2.r].every(Number.isFinite) || c1.r < 0 || c2.r < 0) {
            return [];
        }
        const dx = c2.cx - c1.cx;
        const dy = c2.cy - c1.cy;
        const d = Math.hypot(dx, dy);

        if (d > c1.r + c2.r || d < Math.abs(c1.r - c2.r) || (d === 0 && c1.r === c2.r)) {
            return [];
        }

        const a = (c1.r * c1.r - c2.r * c2.r + d * d) / (2 * d);
        const h = Math.sqrt(Math.max(0, c1.r * c1.r - a * a));

        const x2 = c1.cx + (dx * a) / d;
        const y2 = c1.cy + (dy * a) / d;

        if (h < 1e-9) {
            return [{ x: x2, y: y2 }];
        }

        const rx = (-dy * (h / d));
        const ry = (dx * (h / d));

        return [
            { x: x2 + rx, y: y2 + ry },
            { x: x2 - rx, y: y2 - ry }
        ];
    }
};

/* ==========================================================
   5. GESTOR DE ESTADO E INTERACCIÓN DE OBJETOS
   ================================================---------- */
const ObjectManager = {
    parseObjectExpression(expr) {
        const expression = typeof expr === 'string' ? expr.trim() : '';
        if (!expression) return { tipo: 'vacia' };

        const pointMatch = expression.match(/^([a-zA-Z]\w*)\s*=\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)$/);
        if (pointMatch) {
            return { tipo: 'punto', nombre: pointMatch[1], xExpr: pointMatch[2], yExpr: pointMatch[3] };
        }

        const functionMatch = expression.match(/^(?:([a-zA-Z]\w*)\s*\(\s*x\s*\)|y)\s*=\s*(.+)$/);
        if (functionMatch) {
            return { tipo: 'funcion', nombre: functionMatch[1] || 'y', formula: functionMatch[2] };
        }

        const assignmentMatch = expression.match(/^([a-zA-Z]\w*)\s*=\s*(.+)$/);
        if (assignmentMatch) {
            return { tipo: 'constante', nombre: assignmentMatch[1], formula: assignmentMatch[2] };
        }

        return { tipo: 'funcion', nombre: 'y', formula: expression };
    },

    evaluateAll() {
        const scope = {};
        const parsedObjects = State.objects.map(obj => {
            obj.error = '';
            obj.valor = '';
            obj.compiledFn = null;
            obj.x = undefined;
            obj.y = undefined;
            obj.tipo = '';
            obj.nombre = '';
            const parsed = this.parseObjectExpression(obj.expresion);
            obj.tipo = parsed.tipo;
            obj.nombre = parsed.nombre || '';
            return { obj, parsed };
        });

        parsedObjects.forEach(({ obj, parsed }) => {
            if (parsed.tipo !== 'constante') return;
            const result = MathEngine.evaluate(parsed.formula, scope);
            if (result.error) {
                obj.error = result.error;
                return;
            }
            scope[parsed.nombre] = result.value;
            obj.valor = `${parsed.nombre} = ${result.value}`;
        });

        parsedObjects.forEach(({ obj, parsed }) => {
            if (parsed.tipo !== 'punto') return;
            const x = MathEngine.evaluate(parsed.xExpr, scope);
            const y = MathEngine.evaluate(parsed.yExpr, scope);
            if (x.error || y.error) {
                obj.error = x.error || y.error;
                return;
            }
            obj.x = x.value;
            obj.y = y.value;
            scope[parsed.nombre] = { x: obj.x, y: obj.y };
            obj.valor = `(${obj.x.toFixed(2)}, ${obj.y.toFixed(2)})`;
        });

        parsedObjects.forEach(({ obj, parsed }) => {
            if (parsed.tipo !== 'funcion') return;
            const compiled = MathEngine.compile(parsed.formula);
            if (compiled.error) {
                obj.error = compiled.error;
                return;
            }
            try {
                compiled.compiled.evaluate({ ...scope, x: 0 });
            } catch (err) {
                obj.error = err instanceof Error ? err.message : String(err);
                return;
            }
            obj.compiledFn = x => {
                try {
                    const value = compiled.compiled.evaluate({ ...scope, x });
                    return typeof value === 'number' && Number.isFinite(value) ? value : null;
                } catch {
                    return null;
                }
            };
            obj.valor = parsed.formula;
        });

        parsedObjects.forEach(({ obj, parsed }) => {
            if (parsed.tipo === 'vacia') {
                obj.error = 'Escribe una función, por ejemplo: y = x^2';
            }
            if (parsed.tipo === 'constante' && !obj.error && !obj.valor) {
                obj.error = 'La expresión no devuelve un número real finito.';
            }
            if (parsed.tipo === 'punto' && !obj.error && !obj.valor) {
                obj.error = 'No se pudo calcular este punto.';
            }
            if (parsed.tipo === 'funcion' && !obj.error && !obj.compiledFn) {
                obj.error = 'No se pudo interpretar esta función.';
            }
        });

        return State.objects;
    }
};

function normalizeImportedObjects(imported) {
    if (!Array.isArray(imported) || imported.some(item =>
        !item || typeof item !== 'object' || typeof item.expresion !== 'string')) {
        throw new Error('El proyecto debe contener una lista de expresiones válidas.');
    }

    const importedIds = new Set();
    return imported.map((item, index) => {
        const id = typeof item.id === 'string' && item.id && !importedIds.has(item.id)
            ? item.id
            : generateId();
        importedIds.add(id);
        return {
            id,
            expresion: item.expresion,
            color: /^#[0-9a-f]{6}$/i.test(item.color || '') ? item.color : COLORS[index % COLORS.length],
            visible: item.visible !== false,
            dependeDe: Array.isArray(item.dependeDe) ? item.dependeDe : []
        };
    });
}

/* ==========================================================
   6. RENDERIZADO EN CANVAS
   ================================================---------- */
const CanvasRenderer = {
    init() {
        this.canvas = document.getElementById('math-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());
    },

    resize() {
        if (!this.canvas || !this.ctx) return;
        const rect = this.canvas.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.round(rect.width * dpr);
        this.canvas.height = Math.round(rect.height * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.width = rect.width;
        this.height = rect.height;
        this.render();
    },

    mathToScreen(x, y) {
        const cx = this.width / 2 + (x - State.camera.centerX) * State.camera.scale;
        const cy = this.height / 2 - (y - State.camera.centerY) * State.camera.scale;
        return { x: cx, y: cy };
    },

    screenToMath(px, py) {
        const x = State.camera.centerX + (px - this.width / 2) / State.camera.scale;
        const y = State.camera.centerY + (this.height / 2 - py) / State.camera.scale;
        return { x, y };
    },

    drawGrid() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        const styles = getComputedStyle(document.documentElement);
        ctx.fillStyle = styles.getPropertyValue('--canvas-bg');
        ctx.fillRect(0, 0, w, h);

        const scale = State.camera.scale;
        let step = 1;
        const targetPixels = 80;
        let rawStep = targetPixels / scale;
        let magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
        let residual = rawStep / magnitude;
        if (residual > 5) step = 10 * magnitude;
        else if (residual > 2) step = 5 * magnitude;
        else if (residual > 1) step = 2 * magnitude;
        else step = magnitude;

        const origin = this.mathToScreen(0, 0);

        ctx.lineWidth = 1;
        ctx.strokeStyle = styles.getPropertyValue('--grid-primary');

        let startXMath = Math.floor(this.screenToMath(0, 0).x / step) * step;
        let endXMath = this.screenToMath(w, 0).x;

        for (let x = startXMath; x <= endXMath; x += step) {
            const p = this.mathToScreen(x, 0);
            ctx.beginPath();
            ctx.moveTo(p.x, 0);
            ctx.lineTo(p.x, h);
            ctx.stroke();

            if (Math.abs(x) > 1e-9) {
                ctx.fillStyle = styles.getPropertyValue('--text-muted');
                ctx.font = '11px system-ui';
                ctx.textAlign = 'center';
                ctx.fillText(x.toFixed(step < 1 ? 2 : 0), p.x, Math.min(Math.max(origin.y + 16, 20), h - 10));
            }
        }

        let startYMath = Math.floor(this.screenToMath(0, h).y / step) * step;
        let endYMath = this.screenToMath(0, 0).y;

        for (let y = startYMath; y <= endYMath; y += step) {
            const p = this.mathToScreen(0, y);
            ctx.beginPath();
            ctx.moveTo(0, p.y);
            ctx.lineTo(w, p.y);
            ctx.stroke();

            if (Math.abs(y) > 1e-9) {
                ctx.fillStyle = styles.getPropertyValue('--text-muted');
                ctx.font = '11px system-ui';
                ctx.textAlign = 'right';
                ctx.fillText(y.toFixed(step < 1 ? 2 : 0), Math.min(Math.max(origin.x - 10, 30), w - 10), p.y + 4);
            }
        }

        ctx.lineWidth = 2;
        ctx.strokeStyle = styles.getPropertyValue('--axis-color');

        if (origin.x >= 0 && origin.x <= w) {
            ctx.beginPath();
            ctx.moveTo(origin.x, 0);
            ctx.lineTo(origin.x, h);
            ctx.stroke();
        }

        if (origin.y >= 0 && origin.y <= h) {
            ctx.beginPath();
            ctx.moveTo(0, origin.y);
            ctx.lineTo(w, origin.y);
            ctx.stroke();
        }
    },

    drawObjects() {
        const ctx = this.ctx;
        State.objects.forEach(obj => {
            if (obj.visible === false) return;
            ctx.strokeStyle = obj.color || '#3b82f6';
            ctx.fillStyle = obj.color || '#3b82f6';

            if (obj.tipo === 'punto' && obj.x !== undefined && obj.y !== undefined) {
                const p = this.mathToScreen(obj.x, obj.y);
                ctx.beginPath();
                ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#ffffff';
                ctx.stroke();

                if (obj.nombre) {
                    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-main');
                    ctx.font = 'bold 12px system-ui';
                    ctx.fillText(obj.nombre, p.x + 8, p.y - 8);
                }
            } else if (obj.compiledFn) {
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                let drawing = false;
                let lastYScreen = null;

                for (let px = 0; px <= this.width; px += 2) {
                    const mathCoords = this.screenToMath(px, 0);
                    const val = obj.compiledFn(mathCoords.x);

                    if (val === null || !Number.isFinite(val)) {
                        drawing = false;
                        continue;
                    }

                    const p = this.mathToScreen(mathCoords.x, val);

                    if (lastYScreen !== null && Math.abs(p.y - lastYScreen) > this.height * 1.5) {
                        drawing = false;
                    }
                    lastYScreen = p.y;

                    if (!drawing) {
                        ctx.moveTo(p.x, p.y);
                        drawing = true;
                    } else {
                        ctx.lineTo(p.x, p.y);
                    }
                }
                ctx.stroke();
            }
        });
    },

    render() {
        if (!this.ctx || !this.width || !this.height) return;
        this.drawGrid();
        this.drawObjects();
    }
};

/* ==========================================================
   7. INTERACCIÓN Y EVENTOS DE USUARIO
   ================================================---------- */
const Interaction = {
    init() {
        const canvas = CanvasRenderer.canvas;
        const container = document.getElementById('canvas-container');

        canvas.addEventListener('pointerdown', e => {
            if (e.button !== 0) return;
            canvas.setPointerCapture(e.pointerId);
            State.interaction.isDragging = true;
            State.interaction.startX = e.clientX;
            State.interaction.startY = e.clientY;
            container.classList.add('is-panning');
        });

        canvas.addEventListener('pointermove', e => {
            const rect = canvas.getBoundingClientRect();
            const point = CanvasRenderer.screenToMath(e.clientX - rect.left, e.clientY - rect.top);
            document.getElementById('coordinate-readout').textContent =
                `x: ${point.x.toFixed(2)}   y: ${point.y.toFixed(2)}`;
            if (!State.interaction.isDragging) return;
            const dx = e.clientX - State.interaction.startX;
            const dy = e.clientY - State.interaction.startY;
            State.interaction.startX = e.clientX;
            State.interaction.startY = e.clientY;

            State.camera.centerX -= dx / State.camera.scale;
            State.camera.centerY += dy / State.camera.scale;
            requestAnimationFrame(() => CanvasRenderer.render());
        });

        const stopDragging = () => {
            State.interaction.isDragging = false;
            container.classList.remove('is-panning');
        };
        canvas.addEventListener('pointerup', stopDragging);
        canvas.addEventListener('pointercancel', stopDragging);

        canvas.addEventListener('wheel', e => {
            e.preventDefault();
            const zoomFactor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const mathBefore = CanvasRenderer.screenToMath(mouseX, mouseY);
            State.camera.scale = Math.max(5, Math.min(100000, State.camera.scale * zoomFactor));
            const mathAfter = CanvasRenderer.screenToMath(mouseX, mouseY);

            State.camera.centerX += mathBefore.x - mathAfter.x;
            State.camera.centerY += mathBefore.y - mathAfter.y;

            UI.updateViewStatus();
            CanvasRenderer.render();
        }, { passive: false });
    }
};

const HistoryManager = {
    snapshot() {
        return JSON.stringify(State.objects);
    },

    record(snapshot) {
        if (snapshot === this.snapshot()) return;
        State.history.push(snapshot);
        if (State.history.length > 80) State.history.shift();
        State.redoStack = [];
        UI.updateHistoryButtons();
    },

    restore(snapshot) {
        State.objects = JSON.parse(snapshot);
        ObjectManager.evaluateAll();
        UI.renderObjectsList();
        CanvasRenderer.render();
    },

    undo() {
        if (!State.history.length) return;
        State.redoStack.push(this.snapshot());
        this.restore(State.history.pop());
        UI.updateHistoryButtons();
    },

    redo() {
        if (!State.redoStack.length) return;
        State.history.push(this.snapshot());
        this.restore(State.redoStack.pop());
        UI.updateHistoryButtons();
    }
};

const UI = {
    editSnapshot: null,

    init() {
        this.renderObjectsList();
        this.updateHistoryButtons();
        this.updateViewStatus();

        document.getElementById('btn-add-object').addEventListener('click', () => this.addExpression());
        document.getElementById('btn-undo').addEventListener('click', () => {
            this.finishEdit();
            HistoryManager.undo();
        });
        document.getElementById('btn-redo').addEventListener('click', () => {
            this.finishEdit();
            HistoryManager.redo();
        });
        document.getElementById('zoom-in').addEventListener('click', () => this.zoom(1.25));
        document.getElementById('zoom-out').addEventListener('click', () => this.zoom(1 / 1.25));
        document.getElementById('zoom-reset').addEventListener('click', () => {
            State.camera.centerX = 0;
            State.camera.centerY = 0;
            State.camera.scale = 50;
            this.updateViewStatus();
            CanvasRenderer.render();
        });

        document.getElementById('btn-theme').addEventListener('click', () => {
            const root = document.documentElement;
            const nextTheme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            root.setAttribute('data-theme', nextTheme);
            CanvasRenderer.render();
        });

        document.querySelectorAll('.example-chip').forEach(button => {
            button.addEventListener('click', () => this.addExpression(button.dataset.example));
        });

        document.getElementById('btn-export-json').addEventListener('click', () => this.exportProject());
        document.getElementById('btn-import-json').addEventListener('click', () => {
            document.getElementById('file-input').click();
        });
        document.getElementById('file-input').addEventListener('change', event => this.importProject(event));
        document.getElementById('btn-export-img').addEventListener('click', () => this.exportImage());
        document.getElementById('btn-close-tests').addEventListener('click', () => this.closeTests());

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') this.closeTests();
            const isEditing = event.target instanceof HTMLElement &&
                ['INPUT', 'TEXTAREA'].includes(event.target.tagName);
            if (isEditing || !(event.ctrlKey || event.metaKey)) return;
            if (event.key.toLowerCase() === 'z' && !event.shiftKey) {
                event.preventDefault();
                HistoryManager.undo();
            } else if (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey)) {
                event.preventDefault();
                HistoryManager.redo();
            }
        });
    },

    addExpression(expression = 'y = x^2') {
        this.finishEdit();
        const before = HistoryManager.snapshot();
        State.objects.push({
            id: generateId(),
            expresion: expression,
            color: getNextColor(),
            visible: true,
            dependeDe: []
        });
        HistoryManager.record(before);
        ObjectManager.evaluateAll();
        this.renderObjectsList();
        CanvasRenderer.render();
        const input = this.objectsContainer.lastElementChild?.querySelector('.object-input');
        input?.focus();
        if (!expression) input?.select();
    },

    zoom(factor) {
        State.camera.scale = Math.max(5, Math.min(100000, State.camera.scale * factor));
        this.updateViewStatus();
        CanvasRenderer.render();
    },

    updateViewStatus() {
        const zoomLevel = document.getElementById('zoom-level');
        const status = document.getElementById('graph-status');
        if (zoomLevel) zoomLevel.textContent = `${Math.round(State.camera.scale)} px/u`;
        if (status) {
            status.textContent = State.camera.centerX === 0 && State.camera.centerY === 0
                ? 'Vista estándar'
                : `Centro: ${State.camera.centerX.toFixed(1)}, ${State.camera.centerY.toFixed(1)}`;
        }
    },

    updateHistoryButtons() {
        const undo = document.getElementById('btn-undo');
        const redo = document.getElementById('btn-redo');
        if (undo) undo.disabled = State.history.length === 0;
        if (redo) redo.disabled = State.redoStack.length === 0;
    },

    finishEdit() {
        if (!this.editSnapshot) return;
        HistoryManager.record(this.editSnapshot);
        this.editSnapshot = null;
    },

    updateObjectStatuses() {
        const objectsById = new Map(State.objects.map(obj => [obj.id, obj]));
        this.objectsContainer.querySelectorAll('.object-card').forEach(card => {
            const obj = objectsById.get(card.dataset.objectId);
            if (!obj) return;
            card.querySelector('.object-value').textContent = obj.valor ? `Valor: ${obj.valor}` : '';
            card.querySelector('.object-error').textContent = obj.error || '';
        });
        document.getElementById('expression-count').textContent = String(State.objects.length);
        document.getElementById('empty-state').hidden = State.objects.length !== 0;
    },

    get objectsContainer() {
        return document.getElementById('objects-list-container');
    },

    renderObjectsList() {
        const container = this.objectsContainer;
        container.replaceChildren();

        State.objects.forEach((obj, index) => {
            if (!/^#[0-9a-f]{6}$/i.test(obj.color || '')) obj.color = COLORS[index % COLORS.length];
            const card = document.createElement('article');
            card.className = `object-card${obj.visible === false ? ' is-hidden' : ''}`;
            card.dataset.objectId = obj.id;
            card.style.setProperty('--object-color', obj.color);

            const row = document.createElement('div');
            row.className = 'object-row';

            const dot = document.createElement('span');
            dot.className = 'color-picker-dot';
            dot.setAttribute('aria-hidden', 'true');

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'object-input';
            input.value = obj.expresion;
            input.placeholder = 'y = x^2';
            input.setAttribute('aria-label', `Expresión ${index + 1}`);
            input.autocomplete = 'off';
            input.spellcheck = false;
            input.addEventListener('focus', () => {
                this.editSnapshot = HistoryManager.snapshot();
            });
            input.addEventListener('input', () => {
                obj.expresion = input.value;
                ObjectManager.evaluateAll();
                this.updateObjectStatuses();
                CanvasRenderer.render();
            });
            input.addEventListener('blur', () => this.finishEdit());
            input.addEventListener('keydown', event => {
                if (event.key === 'Enter') input.blur();
            });

            const actions = document.createElement('div');
            actions.className = 'object-actions';

            const visibilityButton = document.createElement('button');
            visibilityButton.type = 'button';
            visibilityButton.className = 'icon-action-btn';
            visibilityButton.textContent = obj.visible === false ? '◌' : '◉';
            visibilityButton.title = obj.visible === false ? 'Mostrar en el gráfico' : 'Ocultar del gráfico';
            visibilityButton.setAttribute('aria-label', visibilityButton.title);
            visibilityButton.setAttribute('aria-pressed', String(obj.visible !== false));
            visibilityButton.addEventListener('click', () => {
                const before = HistoryManager.snapshot();
                obj.visible = obj.visible === false;
                HistoryManager.record(before);
                card.classList.toggle('is-hidden', !obj.visible);
                visibilityButton.textContent = obj.visible ? '◉' : '◌';
                visibilityButton.title = obj.visible ? 'Ocultar del gráfico' : 'Mostrar en el gráfico';
                visibilityButton.setAttribute('aria-label', visibilityButton.title);
                visibilityButton.setAttribute('aria-pressed', String(obj.visible));
                CanvasRenderer.render();
            });

            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'icon-action-btn delete-action';
            deleteButton.textContent = '×';
            deleteButton.title = 'Eliminar expresión';
            deleteButton.setAttribute('aria-label', 'Eliminar expresión');
            deleteButton.addEventListener('click', () => {
                this.finishEdit();
                const before = HistoryManager.snapshot();
                State.objects = State.objects.filter(item => item.id !== obj.id);
                HistoryManager.record(before);
                ObjectManager.evaluateAll();
                this.renderObjectsList();
                CanvasRenderer.render();
            });

            actions.append(visibilityButton, deleteButton);
            row.append(dot, input, actions);
            card.append(row);

            const value = document.createElement('p');
            value.className = 'object-value';
            card.append(value);
            const error = document.createElement('p');
            error.className = 'object-error';
            card.append(error);
            container.append(card);
        });

        this.updateObjectStatuses();
    },

    exportProject() {
        const data = JSON.stringify(State.objects.map(({ id, expresion, color, visible, dependeDe }) =>
            ({ id, expresion, color, visible, dependeDe })), null, 2);
        const link = document.createElement('a');
        link.href = `data:application/json;charset=utf-8,${encodeURIComponent(data)}`;
        link.download = 'omnigraph-proyecto.json';
        link.click();
    },

    importProject(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onerror = () => alert('No se pudo leer el archivo seleccionado.');
        reader.onload = () => {
            try {
                const imported = normalizeImportedObjects(JSON.parse(reader.result));
                const before = HistoryManager.snapshot();
                State.objects = imported;
                colorIndex = State.objects.length;
                HistoryManager.record(before);
                ObjectManager.evaluateAll();
                this.renderObjectsList();
                CanvasRenderer.render();
            } catch (err) {
                alert(err instanceof Error ? err.message : 'El archivo JSON no es válido.');
            } finally {
                event.target.value = '';
            }
        };
        reader.readAsText(file);
    },

    exportImage() {
        try {
            const link = document.createElement('a');
            link.download = 'omnigraph-grafico.png';
            link.href = CanvasRenderer.canvas.toDataURL('image/png');
            link.click();
        } catch (err) {
            alert(`No se pudo exportar la imagen: ${err instanceof Error ? err.message : String(err)}`);
        }
    },

    closeTests() {
        document.getElementById('test-overlay').classList.remove('is-visible');
    }
};

/* ==========================================================
   9. SUITE DE PRUEBAS AUTOMATIZADAS
   ================================================---------- */
const TestSuite = {
    run() {
        const originalObjects = State.objects;
        const originalHistory = State.history;
        const originalRedoStack = State.redoStack;
        const tests = [
            {
                name: 'La multiplicación implícita convierte 2x en 2*x',
                fn: () => MathEngine.preprocessExpression('2x') === '2*x'
            },
            {
                name: 'Acepta multiplicación implícita en paréntesis',
                fn: () => MathEngine.evaluate('2(x + 1)', { x: 2 }).value === 6
            },
            {
                name: 'La notación científica no se altera',
                fn: () => MathEngine.evaluate('1e-3').value === 0.001
            },
            {
                name: 'Evalúa x^2 con el valor de x',
                fn: () => MathEngine.evaluate('x^2', { x: 3 }).value === 9
            },
            {
                name: 'pi conserva el nombre que reconoce Math.js',
                fn: () => Math.abs(MathEngine.evaluate('sin(pi/2)').value - 1) < 1e-9
            },
            {
                name: 'sqrt(-1) devuelve un error legible sin romper la app',
                fn: () => MathEngine.evaluate('sqrt(-1)').value === null
            },
            {
                name: 'La división por cero se detecta como valor no finito',
                fn: () => MathEngine.evaluate('1/0').value === null
            },
            {
                name: 'La sintaxis inválida devuelve error en lugar de lanzar',
                fn: () => MathEngine.evaluate('x + (').error !== null
            },
            {
                name: 'Interpreta y = x^2 como función',
                fn: () => ObjectManager.parseObjectExpression('y = x^2').formula === 'x^2'
            },
            {
                name: 'Interpreta la notación f(x) = ...',
                fn: () => ObjectManager.parseObjectExpression('f(x) = sin(x)').formula === 'sin(x)'
            },
            {
                name: 'Interpreta expresiones de puntos nombrados',
                fn: () => ObjectManager.parseObjectExpression('A = (1, 2)').tipo === 'punto'
            },
            {
                name: 'Grafica una función y calcula su valor de prueba',
                fn: () => {
                    State.objects = [{ id: 'curve', expresion: 'y = x^2', visible: true }];
                    ObjectManager.evaluateAll();
                    return State.objects[0].compiledFn(3) === 9 && !State.objects[0].error;
                }
            },
            {
                name: 'Calcula puntos y constantes nombradas',
                fn: () => {
                    State.objects = [
                        { id: 'constant', expresion: 'a = 3' },
                        { id: 'point', expresion: 'A = (a, 2)' }
                    ];
                    ObjectManager.evaluateAll();
                    return State.objects[1].x === 3 && State.objects[1].y === 2;
                }
            },
            {
                name: 'Importa proyectos y evita IDs duplicados o colores inválidos',
                fn: () => {
                    const imported = normalizeImportedObjects([
                        { id: 'same', expresion: 'y = x' },
                        { id: 'same', expresion: 'A = (1, 2)', color: 'red', visible: false }
                    ]);
                    return imported.length === 2 && imported[0].id !== imported[1].id &&
                        imported[1].color === COLORS[1] && imported[1].visible === false;
                }
            },
            {
                name: 'Rechaza proyectos que no contienen expresiones válidas',
                fn: () => {
                    try {
                        normalizeImportedObjects([{ expresion: 7 }]);
                        return false;
                    } catch {
                        return true;
                    }
                }
            },
            {
                name: 'Un error en una expresión no impide evaluar las demás',
                fn: () => {
                    State.objects = [
                        { id: 'broken', expresion: 'y = (' },
                        { id: 'working', expresion: 'y = x + 1' }
                    ];
                    ObjectManager.evaluateAll();
                    return Boolean(State.objects[0].error) && State.objects[1].compiledFn(2) === 3;
                }
            },
            {
                name: 'Muestra símbolos desconocidos sin rechazar funciones con dominio parcial',
                fn: () => {
                    State.objects = [
                        { id: 'unknown', expresion: 'y = unknownFunction(x)' },
                        { id: 'partial', expresion: 'y = log(x - 2)' }
                    ];
                    ObjectManager.evaluateAll();
                    return Boolean(State.objects[0].error) && !State.objects[1].error &&
                        State.objects[1].compiledFn(4) !== null;
                }
            },
            {
                name: 'Deshacer y rehacer restauran la lista de expresiones',
                fn: () => {
                    State.history = [];
                    State.redoStack = [];
                    State.objects = [{ id: 'one', expresion: 'y = x', visible: true }];
                    const before = HistoryManager.snapshot();
                    State.objects.push({ id: 'two', expresion: 'y = x^2', visible: true });
                    HistoryManager.record(before);
                    HistoryManager.undo();
                    const undone = State.objects.length === 1;
                    HistoryManager.redo();
                    return undone && State.objects.length === 2;
                }
            },
            {
                name: 'El mapeo de coordenadas conserva puntos al invertirlo',
                fn: () => {
                    const points = [{ x: 4.5, y: -2.1 }, { x: -8, y: 0 }, { x: 0, y: 3 }];
                    return points.every(point => {
                        const screen = CanvasRenderer.mathToScreen(point.x, point.y);
                        const back = CanvasRenderer.screenToMath(screen.x, screen.y);
                        return Math.abs(back.x - point.x) < 1e-8 && Math.abs(back.y - point.y) < 1e-8;
                    });
                }
            },
            {
                name: 'La intersección de rectas devuelve el punto correcto',
                fn: () => {
                    const points = Geometry.intersectLines({ a: 1, b: -1, c: 0 }, { a: 1, b: 1, c: 2 });
                    return points.length === 1 && Math.abs(points[0].x - 1) < 1e-8 && Math.abs(points[0].y - 1) < 1e-8;
                }
            },
            {
                name: 'Las rectas paralelas no tienen intersección',
                fn: () => Geometry.intersectLines({ a: 1, b: 0, c: 1 }, { a: 1, b: 0, c: 2 }).length === 0
            },
            {
                name: 'Una recta secante corta el círculo en dos puntos',
                fn: () => Geometry.intersectLineCircle({ a: 0, b: 1, c: 0 }, { cx: 0, cy: 0, r: 2 }).length === 2
            },
            {
                name: 'Una recta tangente corta el círculo en un punto',
                fn: () => Geometry.intersectLineCircle({ a: 0, b: 1, c: 2 }, { cx: 0, cy: 0, r: 2 }).length === 1
            },
            {
                name: 'Una recta degenerada no produce coordenadas inválidas',
                fn: () => Geometry.intersectLineCircle({ a: 0, b: 0, c: 1 }, { cx: 0, cy: 0, r: 2 }).length === 0
            },
            {
                name: 'Los círculos separados no se intersectan',
                fn: () => Geometry.intersectCircles({ cx: 0, cy: 0, r: 1 }, { cx: 5, cy: 5, r: 1 }).length === 0
            },
            {
                name: 'Dos círculos tangentes producen un único punto',
                fn: () => Geometry.intersectCircles({ cx: 0, cy: 0, r: 1 }, { cx: 2, cy: 0, r: 1 }).length === 1
            },
            {
                name: 'Detecta dependencias circulares',
                fn: () => DependencyGraph.detectCycle([
                    { id: 'a', dependeDe: ['b'] },
                    { id: 'b', dependeDe: ['a'] }
                ])
            },
            {
                name: 'Ordena dependencias antes que sus objetos',
                fn: () => {
                    const sorted = DependencyGraph.sortTopological([
                        { id: 'child', dependeDe: ['parent'] },
                        { id: 'parent', dependeDe: [] }
                    ]);
                    return sorted[0].id === 'parent' && sorted[1].id === 'child';
                }
            },
            {
                name: 'La suite puede dibujar sin errores',
                fn: () => {
                    CanvasRenderer.render();
                    return true;
                }
            }
        ];

        const resultsList = document.getElementById('test-results-list');
        resultsList.replaceChildren();
        let passedCount = 0;
        try {
            tests.forEach(test => {
                let failure = '';
                let passed = false;
                try {
                    passed = test.fn() === true;
                    if (!passed) failure = 'La condición esperada no se cumplió.';
                } catch (err) {
                    failure = err instanceof Error ? err.message : String(err);
                }
                if (passed) passedCount++;

                const item = document.createElement('div');
                item.className = `test-item ${passed ? 'pass' : 'fail'}`;
                const name = document.createElement('span');
                name.textContent = test.name;
                const result = document.createElement('span');
                result.className = 'test-result';
                result.textContent = passed ? 'PASS' : `FAIL — ${failure}`;
                item.append(name, result);
                resultsList.append(item);
                console.log(`[TEST] ${test.name}: ${passed ? 'PASSED' : `FAILED — ${failure}`}`);
            });
        } finally {
            State.objects = originalObjects;
            State.history = originalHistory;
            State.redoStack = originalRedoStack;
            ObjectManager.evaluateAll();
            UI.renderObjectsList();
            CanvasRenderer.render();
            UI.updateHistoryButtons();
        }

        document.getElementById('test-summary').textContent =
            `${passedCount} de ${tests.length} pruebas pasaron${passedCount === tests.length ? '.' : `; ${tests.length - passedCount} requieren atención.`}`;

        if (window.location.search.includes('test=1')) {
            document.getElementById('test-overlay').classList.add('is-visible');
        }
    }
};

/* ==========================================================
   10. INICIALIZACIÓN GENERAL
   ================================================---------- */
window.addEventListener('DOMContentLoaded', () => {
    State.objects = [
        { id: generateId(), expresion: 'y = x^2 - 2', color: COLORS[0], visible: true, dependeDe: [] },
        { id: generateId(), expresion: 'A = (1, -1)', color: COLORS[1], visible: true, dependeDe: [] }
    ];
    colorIndex = State.objects.length;

    CanvasRenderer.init();
    Interaction.init();
    ObjectManager.evaluateAll();
    UI.init();
    CanvasRenderer.render();

    if (window.location.search.includes('test=1')) {
        TestSuite.run();
    }
});