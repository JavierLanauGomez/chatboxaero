@echo off
echo =============================================
echo  ChatboxAero - Arrancar backend
echo =============================================
echo.

REM Comprobar que Ollama está corriendo
curl -s http://localhost:11434 >nul 2>&1
if errorlevel 1 (
    echo ERROR: Ollama no está arrancado.
    echo Abre Ollama antes de ejecutar este script.
    pause
    exit /b 1
)

REM Activar entorno virtual si existe
if exist venv\Scripts\activate.bat (
    call venv\Scripts\activate.bat
) else (
    echo Creando entorno virtual...
    python -m venv venv
    call venv\Scripts\activate.bat
    pip install -r backend\requirements.txt
)

echo.
echo Arrancando API en http://localhost:8000
echo Abre frontend\index.html en el navegador
echo.
cd backend
uvicorn main:aplicacion --reload --port 8000
