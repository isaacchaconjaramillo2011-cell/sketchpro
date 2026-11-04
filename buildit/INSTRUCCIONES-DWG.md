# Exportación DWG local

SketchPlus usa **ODA File Converter**, publicado por Open Design Alliance (ODA). No requiere una clave API y la conversión se ejecuta en este equipo; el plano no se envía a un servicio en la nube.

1. Instala ODA File Converter desde la página oficial: https://www.opendesign.com/guestfiles/oda_file_converter
2. Si Python 3 no está instalado, instálalo desde https://www.python.org/downloads/ y habilítalo en `PATH`.
3. Ejecuta `iniciar_sketchplus.bat` desde la carpeta de la aplicación.
4. Abre `http://127.0.0.1:8765` en el navegador.
5. Selecciona **DWG (requiere ODA local)** y pulsa **Exportar**.

El servidor local usa solo Python estándar, escucha en `127.0.0.1` y busca el ejecutable de ODA en las ubicaciones habituales de Windows. Si está instalado en otra ruta, configura la variable de entorno `ODA_FILE_CONVERTER_EXE` con la ruta completa a `ODAFileConverter.exe` antes de iniciar SketchPlus.

También se puede exportar DXF directamente desde el navegador. DWG necesita que ODA File Converter esté instalado y que SketchPlus se abra desde el servidor local; abrir `index.html` directamente como archivo no activa esa conversión. Revisa las condiciones de licencia vigentes de ODA al instalar o usar su herramienta.
