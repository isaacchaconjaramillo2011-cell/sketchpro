/**
 * /js/utilidades.js
 * Funciones auxiliares para formato de moneda, cálculos y manipulación de datos.
 */

/**
 * Formatea un valor numérico como moneda en Pesos Colombianos (COP).
 * @param {number} valor - Valor numérico a formatear.
 * @returns {string} Cadena formateada (ej: "$ 150.000 COP").
 */
export function formatearMoneda(valor) {
    if (isNaN(valor) || valor === null) return "$ 0 COP";
    const numeroRedondeado = Math.round(valor);
    const formateado = numeroRedondeado.toLocaleString('es-CO');
    return `$ ${formateado} COP`;
}

/**
 * Redondea un número a una cantidad específica de decimales.
 * @param {number} valor - Número a redondear.
 * @param {number} decimales - Cantidad de decimales.
 * @returns {number} Número redondeado.
 */
export function redondear(valor, decimales = 2) {
    const factor = Math.pow(10, decimales);
    return Math.round(valor * factor) / factor;
}

/**
 * Genera un identificador único alfanumérico.
 * @returns {string} ID único.
 */
export function generarIdUnico() {
    return 'id_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

/**
 * Muestra una notificación visual temporal en pantalla (Toast).
 * @param {string} mensaje - Texto a mostrar.
 * @param {string} tipo - 'success' | 'error' | 'info'.
 */
export function mostrarNotificacion(mensaje, tipo = 'info') {
    let contenedor = document.getElementById('toast-container');
    if (!contenedor) {
        contenedor = document.createElement('div');
        contenedor.id = 'toast-container';
        contenedor.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px;';
        document.body.appendChild(contenedor);
    }

    const toast = document.createElement('div');
    const colorFondo = tipo === 'success' ? '#10b981' : tipo === 'error' ? '#ef4444' : tipo === 'warning' ? '#f59e0b' : '#3b82f6';
    toast.style.cssText = `background-color: ${colorFondo}; color: white; padding: 12px 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); font-size: 0.9rem; max-width: 420px; transition: opacity 0.3s ease;`;
    toast.textContent = mensaje;

    contenedor.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, tipo === 'warning' ? 8000 : 3000);
}