@echo off
rem Startet das Hand-Logbuch und oeffnet es im Browser. Fenster offen lassen, solange du spielst.
title Hand-Logbuch
cd /d "%~dp0"
rem Browser erst nach 2 Sekunden oeffnen, wenn der Server schon lauscht.
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start "" http://127.0.0.1:8139"
node server.js
pause
