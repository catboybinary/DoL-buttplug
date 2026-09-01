@echo off

echo.
echo buttplug integration      
echo.

setlocal enabledelayedexpansion

set "file="

:: User provided a file
if not "%~1"=="" (
    if exist "%~1" (
        set "file=%~1"
        goto proc
    ) else (
        echo ERROR: '%~1' is not a valid file.
        goto gentle_exit
    )
)
:: No file provided - Gather all html files
set i=0
for %%f in (*.html) do (
    set "entry[!i!]=%%f"
    set /a i+=1
)
:: No files
if !i! equ 0 (
    echo ERROR: No .html files found in '%cd%'.
    echo Ensure this script is in the same folder as the game .html file to patch.
    goto gentle_exit
)
:: Exactly one file
if !i! equ 1 (
    set /p singleChoice=Found .html file '!entry[0]!'. Patch it? [y/N]:
    echo.
    set "firstCharSingleChoice=!singleChoice:~0,1!"
    if /i "!firstCharSingleChoice!"=="y" (
        set "file=!entry[0]!"
        goto proc
    ) else (
        echo Ensure this script is in the same folder as the game .html file to patch.
        goto gentle_exit
    )
)
:: Multiple files - List and prompt
echo Available .html files in '%cd%':
echo.
set /a last_index=i-1
for /L %%j in (0,1,!last_index!) do (
    echo  ^(%%j^) !entry[%%j]!
)
echo.
set /p entryIndex=Enter the number of the file to patch [0-!last_index!]:
echo.
set "file=!entry[%entryIndex%]!"

if not defined file (
    echo ERROR: Invalid number.
    goto gentle_exit
)

:proc
if "%file%"=="" (
    goto gentle_exit
)

echo Analyzing '%file%'...
echo.

if /i not "%file:~-5%"==".html" (
    echo '%file%' is not an HTML file.
    goto gentle_exit
)

powershell -Command "$content = Get-Content '%file%' -Raw; if ($content -match '(?i)vrelnir|lewdity') { exit 0 } else { exit 1 }"
if not %errorlevel% equ 0 (
    echo '%file%' mentions neither 'lewdity' nor 'vrelnir'.
    set /p lewdityChoice=Are you sure this is a Degrees of Lewdity game file? [y/N]:
    echo.
    set "firstCharLewdityChoice=!lewdityChoice:~0,1!"
    if /i not "!firstCharLewdityChoice!"=="y" (
        goto gentle_exit
    )
)

powershell -Command "$content = Get-Content '%file%' -Raw; if ($content -match 'buttplug-mod/importer.js') { exit 0 } else { exit 1 }"
if %errorlevel% equ 0 (
    echo File contains a Buttplug.io injection.
    set /p uninstallChoice=Would you like to uninstall Buttplug.io? [y/N]:
    echo.
    set "firstCharUninstallChoice=!uninstallChoice:~0,1!"
    if /i "!firstCharUninstallChoice!"=="y" (
        goto unpatch
    ) else (
        echo Verifying integrity...
        goto patch
    )
)

:patch
echo Patching...

:: Check if connect-src is already present
echo [CSP] Checking whether connect-src is already present...
powershell -Command "if ((Get-Content '!file!' -Raw) -match 'connect-src ''self'' ws://localhost:12345') { exit 0 } else { exit 1 }"
set "patched=!errorlevel!"

if !patched! equ 0 (
    echo [CSP] connect-src already present; nothing to do.
    goto patch_inject
)

echo [CSP] connect-src not found. Looking for anchor: font-src 'self' data:
powershell -Command "if ((Get-Content '!file!' -Raw) -match 'font-src ''self'' data:') { exit 0 } else { exit 1 }"
set "exists=!errorlevel!"

if !exists! equ 0 (
    echo [CSP] Anchor found; inserting connect-src...
    powershell -Command "(Get-Content '!file!' -Raw) -replace 'font-src ''self'' data:', 'font-src ''self'' data:; connect-src ''self'' ws://localhost:12345' | Set-Content '!file!'"

    :: Verify patch
    powershell -Command "if ((Get-Content '!file!' -Raw) -match 'connect-src ''self'' ws://localhost:12345') { exit 0 } else { exit 1 }"
    set "verified=!errorlevel!"

    if !verified! equ 0 (
        echo [CSP] OK: connect-src added.
    ) else (
        echo [CSP][ERROR] sed completed but connect-src is still missing.
        echo Current CSP-related lines:
        findstr /n /i "Content-Security-Policy connect-src font-src" "!file!"
    )
) else (
    echo [CSP][ERROR] Anchor 'font-src ''self'' data:' not found. The CSP may have changed.
    echo Current CSP-related lines:
    findstr /n /i "Content-Security-Policy connect-src font-src" "!file!"
)

:patch_inject
:: Check if buttplug is already injected
echo [INJECT] Checking for existing Buttplug.io injection...
powershell -Command "if ((Get-Content '!file!' -Raw) -match 'buttplug-mod/importer.js') { exit 0 } else { exit 1 }"
set "injected=!errorlevel!"

if !injected! neq 0 (
    echo [INJECT] Checking for '</head>' anchor...
    powershell -Command "if ((Get-Content '!file!' -Raw) -match '</head>') { exit 0 } else { exit 1 }"
    set "head=!errorlevel!"

    if !head! equ 0 (
        echo [INJECT] Anchor found; injecting importer script...
        powershell -Command "(Get-Content '!file!' -Raw) -replace '(</head>)', \"^<script src='./buttplug-mod/importer.js'^>^</script^>`r`n`$1\" | Set-Content '!file!'"

        :: Verify injection
        powershell -Command "$content = Get-Content '!file!' -Raw; if ($content -match 'buttplug-mod/importer.js') { exit 0 } else { exit 1 }"
        set "verified=!errorlevel!"

        if !verified! equ 0 (
            echo [INJECT] OK: Buttplug.io injected.
            echo.
            echo Remember to drag the 'buttplug-mod' folder from the zip into the game's base directory.
        ) else (
            echo [INJECT][ERROR] Failed to inject Buttplug.io before '^</head^>'.
        )
    ) else (
        echo [INJECT][ERROR] Could not inject because the file is missing a '^</head^>'.
    )
) else (
    echo [INJECT] Already injected; nothing to do.
)
goto gentle_exit

:unpatch
echo Unpatching...

:: Check if connect-src is present to remove
echo [CSP] Checking whether connect-src is present to remove...
powershell -Command "if ((Get-Content '!file!' -Raw) -match 'connect-src ''self'' ws://localhost:12345') { exit 0 } else { exit 1 }"
set "patched=!errorlevel!"

if !patched! equ 0 (
    echo [CSP] connect-src found; removing it...
    powershell -Command "(Get-Content '!file!' -Raw) -replace '; connect-src ''self'' ws://localhost:12345', '' | Set-Content '!file!'"

    :: Verify removal
    powershell -Command "if ((Get-Content '!file!' -Raw) -match 'connect-src ''self'' ws://localhost:12345') { exit 0 } else { exit 1 }"
    set "verified=!errorlevel!"

    if !verified! neq 0 (
        echo [CSP] OK: connect-src removed.
    ) else (
        echo [CSP][ERROR] connect-src still present after removal.
        echo Current CSP-related lines:
        findstr /n /i "Content-Security-Policy connect-src font-src" "!file!"
    )
) else (
    echo [CSP] connect-src not present; nothing to restore.
)

:: Check if buttplug injection exists
powershell -Command "if ((Get-Content '!file!' -Raw) -match 'buttplug-mod/importer.js') { exit 0 } else { exit 1 }"
set "injected=!errorlevel!"

if !injected! equ 0 (
    :: Remove injection
    powershell -Command "(Get-Content '!file!' -Raw) -replace \"^<script src='./buttplug-mod/importer.js'^>^</script^>`r`n\", '' | Set-Content '!file!'"

    :: Verify removal
    powershell -Command "if ((Get-Content '!file!' -Raw) -match 'buttplug-mod/importer.js') { exit 0 } else { exit 1 }"
    set "verified=!errorlevel!"

    if !verified! neq 0 (
        echo Successfully un-patched Buttplug.io from '!file!'
        echo.
        echo Remember to remove the 'buttplug-mod' folder from the game's base directory.
        echo ^(Or leave it. It doesn't do anything. I'm not your mom.^)
    ) else (
        echo ERROR: Failed to remove Buttplug.io injection.
    )
) else (
    echo File doesn't contain a Buttplug.io hook, no changes necessary.
)

:gentle_exit
echo.
echo Press any key to exit...
pause >nul
