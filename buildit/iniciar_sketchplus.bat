@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
    py -3 servidor_local.py
    goto fin
)
where python >nul 2>nul
if not errorlevel 1 (
    python servidor_local.py
    goto fin
)
echo Python 3 no esta instalado o no esta disponible en PATH.
echo Instala Python desde https://www.python.org/downloads/ y vuelve a iniciar SketchPlus.
:fin
pause
