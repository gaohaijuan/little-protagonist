@echo off
cd /d "%~dp0"
echo Starting the local admin server. Keep this window open.
echo Admin: http://127.0.0.1:4180/admin
echo Reader: http://127.0.0.1:4180/
echo The administrator password will appear below.
node scripts\build-preview.cjs
if errorlevel 1 goto failed
node server\start.cjs
:failed
pause
