@echo off
chcp 65001 >nul
title GT7 Race Engineer
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (py -3 gt7_relais.py) else (python gt7_relais.py)
echo.
echo  Programme arrete. Si Python est introuvable, installe-le depuis python.org
echo  en cochant "Add python.exe to PATH".
pause
