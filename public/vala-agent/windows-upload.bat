@echo off
chcp 65001 >nul 2>&1
title SaaSVala Bulk Uploader v2.0
color 0A

echo.
echo ╔═══════════════════════════════════════════════════════════╗
echo ║         SAASVALA BULK GITHUB UPLOADER v2.0                ║
echo ║         Simple. Fast. Reliable.                           ║
echo ╚═══════════════════════════════════════════════════════════╝
echo.

REM Get token
set /p TOKEN=GitHub Token paste karo (ghp_... wala): 

if "%TOKEN%"=="" (
    echo.
    echo Token nahi diya! Exit ho raha hai...
    pause
    exit /b 1
)

echo.
echo Token check ho raha hai...

REM Validate token (basic check)
curl -s -H "Authorization: token %TOKEN%" "https://api.github.com/user" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Token galat hai ya curl nahi mila!
    pause
    exit /b 1
)

echo Token sahi hai!
echo.

REM Count folders
set TOTAL=0
for /D %%F in (*) do (
    if not "%%F"==".git" (
        set /a TOTAL+=1
    )
)

echo Total folders: %TOTAL%
echo.
echo 3 second me start hoga... (Ctrl+C to cancel)
timeout /t 3 /nobreak >nul

REM Counters
set SUCCESS=0
set FAIL=0
set CURRENT=0

REM Log file
set LOG=upload_%date:~-4%%date:~3,2%%date:~0,2%.log
echo Upload started: %date% %time% > %LOG%

REM Process each folder
for /D %%F in (*) do (
    if not "%%F"==".git" (
        set /a CURRENT+=1
        
        echo.
        echo [!CURRENT!/%TOTAL%] %%F
        
        cd "%%F"
        
        REM Create repo
        curl -s -X POST -H "Authorization: token %TOKEN%" -H "Accept: application/vnd.github.v3+json" "https://api.github.com/user/repos" -d "{\"name\":\"%%F\",\"private\":false}" >nul 2>&1
        
        REM Git setup
        if not exist ".git" git init -q 2>nul
        git remote remove origin 2>nul
        git remote add origin "https://%TOKEN%@github.com/SaaSVala/%%F.git" 2>nul
        
        REM Commit
        git add -A 2>nul
        git commit -q -m "Auto upload via SaaSVala" 2>nul
        
        REM Push
        git branch -M main 2>nul
        git push -u origin main --force -q 2>nul
        
        if !ERRORLEVEL!==0 (
            echo   Done!
            echo SUCCESS: %%F >> "..\%LOG%"
            set /a SUCCESS+=1
        ) else (
            echo   Failed!
            echo FAILED: %%F >> "..\%LOG%"
            set /a FAIL+=1
        )
        
        cd ..
        timeout /t 1 /nobreak >nul
    )
)

echo.
echo ═══════════════════════════════════════════════════════════
echo Success: %SUCCESS%
echo Failed:  %FAIL%
echo ═══════════════════════════════════════════════════════════
echo.
echo Log: %LOG%
echo Repos: https://github.com/SaaSVala?tab=repositories
echo.
pause
