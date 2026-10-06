@echo off
title Broasteria - Servidor
cd /d "%~dp0"

echo.
echo   ============================================
echo    BROASTERIA - Iniciando servidor
echo   ============================================
echo.

if not exist "data\broasteria.db" (
  echo  Primera vez: preparando datos del catalogo...
  call npm run seed
  echo.
)

echo  Levantando servidor en http://localhost:3000
echo  La web se sirve en esa misma direccion.
echo.
echo  Para detener: cierra esta ventana o presiona Ctrl+C
echo.

start "" http://localhost:3000
call npm start

echo.
echo  Servidor detenido.
pause
