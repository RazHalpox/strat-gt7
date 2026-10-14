@echo off
chcp 65001 >nul
title GT7 Race Engineer - DEMO
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (py -3 gt7_relais.py --demo) else (python gt7_relais.py --demo)
pause
