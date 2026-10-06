@echo off
title Broasteria - Modo desarrollo
cd /d "%~dp0"

echo.
echo   ============================================
echo    BROASTERIA - Modo desarrollo (2 procesos)
echo   ============================================
echo.
echo   API      ->  http://localhost:3000
echo   Web      ->  http://localhost:3001
echo.
echo   Detener: cierra ambas ventanas, o Ctrl+C aqui
echo.

if not exist "data\broasteria.db" call npm run seed

start "Broasteria API" cmd /k "cd /d "%~dp0" && npm run dev:server"
timeout /t 3 /nobreak >nul
start "Broasteria Web" cmd /k "cd /d "%~dp0" && npm run dev:client"

echo.
echo  Las dos ventanas se abrieron. No cierres esta hasta terminar.
pause
