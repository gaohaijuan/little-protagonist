@echo off
cd /d "%~dp0"
node scripts\open-preview.cjs
if errorlevel 1 pause
