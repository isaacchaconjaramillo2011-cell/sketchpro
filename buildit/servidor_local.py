"""Servidor local de SketchPlus y puente seguro hacia ODA File Converter."""

import glob
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parent
HOST = "127.0.0.1"
PORT = 8765
MAX_REQUEST_BYTES = 8 * 1024 * 1024
ALLOWED_HOSTS = {f"{HOST}:{PORT}", f"localhost:{PORT}"}


def encontrar_oda():
    configurado = os.environ.get("ODA_FILE_CONVERTER_EXE")
    candidatos = [configurado] if configurado else []
    encontrado = shutil.which("ODAFileConverter.exe")
    if encontrado:
        candidatos.append(encontrado)

    directorios = {
        os.environ.get("ProgramFiles"),
        os.environ.get("ProgramFiles(x86)"),
        os.environ.get("LOCALAPPDATA"),
    }
    for directorio in filter(None, directorios):
        raiz = Path(directorio)
        candidatos.extend(glob.glob(str(raiz / "ODA*" / "ODAFileConverter.exe")))
        candidatos.extend(glob.glob(str(raiz / "ODA File Converter*" / "ODAFileConverter.exe")))
        candidatos.extend(glob.glob(str(raiz / "ODA" / "ODAFileConverter*" / "ODAFileConverter.exe")))

    for candidato in candidatos:
        if candidato and Path(candidato).is_file():
            return str(Path(candidato).resolve())
    return None


class SketchPlusHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, status, payload):
        contenido = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(contenido)))
        self.end_headers()
        self.wfile.write(contenido)

    def do_GET(self):
        if self.path == "/api/status":
            self.send_json(200, {
                "odaInstalled": encontrar_oda() is not None,
                "provider": "ODA File Converter local",
            })
            return
        super().do_GET()

    def do_POST(self):
        if urlsplit(self.path).path != "/api/convert/dwg":
            self.send_error(404, "Ruta no encontrada.")
            return
        if self.headers.get("Host", "") not in ALLOWED_HOSTS:
            self.send_error(403, "Host no permitido.")
            return
        origen = self.headers.get("Origin")
        if origen not in {f"http://{HOST}:{PORT}", f"http://localhost:{PORT}"}:
            self.send_error(403, "Origen no permitido.")
            return

        try:
            longitud = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_json(400, {"error": "Tamaño de solicitud no válido."})
            return
        if longitud <= 0 or longitud > MAX_REQUEST_BYTES:
            self.send_json(413, {"error": "El plano está vacío o supera el límite de 8 MB."})
            return

        try:
            solicitud = json.loads(self.rfile.read(longitud).decode("utf-8"))
            dxf = solicitud.get("dxf") if isinstance(solicitud, dict) else None
            if not isinstance(dxf, str) or not dxf.strip() or len(dxf.encode("utf-8")) > MAX_REQUEST_BYTES:
                self.send_json(400, {"error": "No se recibió un archivo DXF válido."})
                return
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.send_json(400, {"error": "La solicitud no contiene JSON válido."})
            return

        ejecutable_oda = encontrar_oda()
        if not ejecutable_oda:
            self.send_json(503, {
                "error": "No se encontró ODA File Converter. Instálalo desde opendesign.com o configura ODA_FILE_CONVERTER_EXE."
            })
            return

        try:
            with tempfile.TemporaryDirectory(prefix="sketchplus-oda-") as temporal:
                carpeta_entrada = Path(temporal) / "entrada"
                carpeta_salida = Path(temporal) / "salida"
                carpeta_entrada.mkdir()
                carpeta_salida.mkdir()
                (carpeta_entrada / "plano-sketchplus.dxf").write_text(dxf, encoding="utf-8")

                resultado = subprocess.run(
                    [
                        ejecutable_oda,
                        str(carpeta_entrada),
                        str(carpeta_salida),
                        "ACAD2018",
                        "DWG",
                        "0",
                        "0",
                        "*.dxf",
                    ],
                    capture_output=True,
                    text=True,
                    timeout=120,
                    check=False,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                )
                archivo_dwg = carpeta_salida / "plano-sketchplus.dwg"
                if resultado.returncode != 0 or not archivo_dwg.is_file():
                    detalle = (resultado.stderr or resultado.stdout or "").strip()
                    print(f"Fallo de ODA File Converter ({resultado.returncode}): {detalle}")
                    self.send_json(502, {
                        "error": "ODA File Converter no pudo convertir el DXF. Revisa la instalación y vuelve a intentarlo."
                    })
                    return

                contenido = archivo_dwg.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/acad")
            self.send_header("Content-Disposition", 'attachment; filename="plano-sketchplus.dwg"')
            self.send_header("Content-Length", str(len(contenido)))
            self.end_headers()
            self.wfile.write(contenido)
        except subprocess.TimeoutExpired:
            self.send_json(504, {"error": "La conversión excedió el límite de 120 segundos."})
        except OSError as error:
            print(f"Error ejecutando ODA File Converter: {error}")
            self.send_json(500, {"error": "No se pudo ejecutar ODA File Converter."})

    def log_message(self, formato, *args):
        print(f"[SketchPlus] {self.address_string()} - {formato % args}")

    def translate_path(self, path):
        ruta_url = unquote(urlsplit(path).path).lstrip("/")
        ruta = (ROOT / ruta_url).resolve()
        dentro_de_recursos = any(
            carpeta in ruta.parents
            for carpeta in (ROOT / "js", ROOT / "css")
        )
        if ruta != ROOT and ruta != ROOT / "index.html" and not dentro_de_recursos:
            return str(ROOT / "__ruta_invalida__")
        if ruta != ROOT and ROOT not in ruta.parents:
            return str(ROOT / "__ruta_invalida__")
        return str(ruta)


if __name__ == "__main__":
    servidor = ThreadingHTTPServer((HOST, PORT), SketchPlusHandler)
    print(f"SketchPlus disponible en http://{HOST}:{PORT}")
    if encontrar_oda():
        print("ODA File Converter detectado: exportación DWG habilitada.")
    else:
        print("ODA File Converter no detectado: instala el conversor oficial para exportar DWG.")
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nCerrando el servidor local.")
    finally:
        servidor.server_close()
