@echo off
chcp 65001 >nul
title GT7 Race Engineer - RELECTURE
cd /d "%~dp0"
echo Vitesse de relecture : 1 = temps reel, 5 = cinq fois plus vite, 20 = tres rapide
set /p V="Vitesse (Entree = 5) : "
if "%V%"=="" set V=5
where py >nul 2>nul
if %errorlevel%==0 (py -3 gt7_relais.py --replay --vitesse %V%) else (python gt7_relais.py --replay --vitesse %V%)
pause
