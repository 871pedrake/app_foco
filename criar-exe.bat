@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   Criando o Foco.exe - aguarde (5 a 15 min)
echo ============================================
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo ERRO: O Node.js nao esta instalado.
  echo Baixe a versao LTS em https://nodejs.org, instale e tente de novo.
  pause
  exit /b
)
call npm install --legacy-peer-deps --no-audit --no-fund
if errorlevel 1 goto erro
call npm install react-is@19 --legacy-peer-deps --no-audit --no-fund
if errorlevel 1 goto erro
call npm run dist
if errorlevel 1 goto erro
echo.
echo PRONTO! Seu arquivo esta na pasta "release": Foco.exe
start "" "%~dp0release"
pause
exit /b
:erro
echo.
echo Algo deu errado. Tire um print desta janela e me envie.
pause
