#!/usr/bin/env bash
set -euo pipefail

print-logo() {
cat << 'EOF'

  _           _   _         _               _       
 | |         | | | |       | |             (_)      
 | |__  _   _| |_| |_ _ __ | |_   _  __ _   _  ___  
 | '_ \| | | | __| __| '_ \| | | | |/ _` | | |/ _ \ 
 | |_) | |_| | |_| |_| |_) | | |_| | (_| |_| | (_) |
 |_.__/ \__,_|\__|\__| .__/|_|\__,_|\__, (_)_|\___/ 
                     | |             __/ |          
                     |_|            |___/           

EOF
}

gentle_exit() {
    if [[ -z "${CI-}" ]]; then
        echo
        read -n 1 -s -r -p "Press any key to exit..."
        echo
    else
        echo "Running in CI pipeline. Exiting without user input."
    fi
    exit 0
}

# The directive we add, and the stable anchor we insert it after.
# "font-src 'self' data:" is the tail of the CSP content attribute and is left
# untouched by Breeze of Lewdity's own CSP patch, so it works on vanilla and
# already-BoL-patched files alike.
CONNECT_SRC="connect-src 'self' ws://localhost:12345"
CSP_ANCHOR="font-src 'self' data:"

show_csp() {
    local file="$1"
    echo "  -> CSP-related lines in '$file':"
    grep -n -i -E "content-security-policy|default-src|img-src|font-src|connect-src|media-src|script-src" "$file" || echo "  -> (none found)"
}

patch_csp() {
    local file="$1"
    echo "[CSP] Checking whether connect-src is already present..."

    if grep -qF "$CONNECT_SRC" "$file"; then
        echo "[CSP] connect-src already present; nothing to do."
        return 0
    fi

    echo "[CSP] connect-src not found. Looking for anchor: $CSP_ANCHOR"
    if grep -qF "$CSP_ANCHOR" "$file"; then
        echo "[CSP] Anchor found; inserting connect-src..."
        sed -i "s|${CSP_ANCHOR}|${CSP_ANCHOR}; ${CONNECT_SRC}|g" "$file"
        if grep -qF "$CONNECT_SRC" "$file"; then
            echo "[CSP] OK: connect-src added."
        else
            echo "[CSP][ERROR] sed completed but connect-src is still missing."
            show_csp "$file"
        fi
    else
        echo "[CSP][ERROR] Anchor '$CSP_ANCHOR' not found. The CSP may have changed."
        show_csp "$file"
    fi
}

unpatch_csp() {
    local file="$1"
    echo "[CSP] Checking whether connect-src is present to remove..."

    if grep -qF "$CONNECT_SRC" "$file"; then
        echo "[CSP] connect-src found; removing it..."
        sed -i "s|; ${CONNECT_SRC}||g" "$file"
        if grep -qF "$CONNECT_SRC" "$file"; then
            echo "[CSP][ERROR] connect-src still present after removal."
            show_csp "$file"
        else
            echo "[CSP] OK: connect-src removed."
        fi
    else
        echo "[CSP] connect-src not present; nothing to restore."
    fi
}

inject() {
    local file="$1"
    echo "[INJECT] Checking for existing Buttplug.io injection..."
    if grep -q 'buttplug-mod/importer.js' "$file"; then
        echo "[INJECT] Already injected; nothing to do."
    else
        echo "[INJECT] Checking for '</head>' anchor..."
        if grep -q '</head>' "$file"; then
            echo "[INJECT] Anchor found; injecting importer script..."
            sed -i "\|</head>|i <script src='./buttplug-mod/importer.js'></script>" "$file"
            if grep -q 'buttplug-mod/importer.js' "$file"; then
                echo "[INJECT] OK: Buttplug.io injected."
                echo " "
                echo "Remember to drag the 'buttplug-mod' folder from the zip into the game's base directory."
            else
                echo "[INJECT][ERROR] sed completed but importer.js is still missing."
            fi
        else
            echo "[INJECT][ERROR] Could not inject because the file is missing a '</head>'."
        fi
    fi
}

remove_injection() {
    local file="$1"
    echo "[INJECT] Checking for existing Buttplug.io injection to remove..."
    if ! grep -q 'buttplug-mod/importer.js' "$file"; then
        echo "[INJECT] No injection found; nothing to do."
    else
        echo "[INJECT] Injection found; removing..."
        sed -i "\|<script src='./buttplug-mod/importer.js'></script>|d" "$file"
        if ! grep -q 'buttplug-mod/importer.js' "$file"; then
            echo "[INJECT] OK: Buttplug.io un-patched from '$file'"
            echo " "
            echo "Remember to remove the 'buttplug-mod' folder from the game's base directory."
            echo "(Or leave it. It doesn't do anything. I'm not your mom.)"
        else
            echo "[INJECT][ERROR] Failed to remove injection."
        fi
    fi
}

patch() {
    echo Patching...
    patch_csp "$1"
    inject "$1"
    gentle_exit
}

unpatch() {
    echo Unpatching...
    unpatch_csp "$1"
    remove_injection "$1"
    gentle_exit
}

print-logo

file=""
if [[ -n "${1-}" ]]; then
    if [[ -f "$1" ]]; then
        file="$1"
    else
        echo "ERROR: '$1' is not a valid file."
    fi
else
    html_files=(*.html)
    numOfEntries="${#html_files[@]}"
    if [[ $numOfEntries -eq 0 ]]; then
        echo "ERROR: No .html files found in '$(pwd)'."
        echo "Ensure this script is in the same folder as the game .html file to patch."
    elif [[ $numOfEntries -eq 1 ]]; then
        read -p "Found .html file '${html_files[0]}'. Patch it? (y/N): " choice
        echo " "
        if [[ "${choice-}" =~ ^[Yy] ]]; then
            file="${html_files[0]}"
        else
            echo "Ensure this script is in the same folder as the game .html file to patch."
        fi
    else
        echo "Available .html files in $(pwd):"
        echo " "
        for i in "${!html_files[@]}"; do
            echo " ($i) ${html_files[$i]}"
        done
        echo " "
        read -p "Enter the number of the file to patch (0-$(($numOfEntries-1))): " index
        echo " "
        if [[ "$index" =~ ^[0-9]+$ ]]; then
            if (( index >= 0 && index < numOfEntries )); then
                file="${html_files[index]}"
            else
                echo "ERROR: Invalid number (out of range)."
            fi
        else
            echo "ERROR: Not a number."
        fi
    fi
fi

if [[ -z "$file" ]]; then
    gentle_exit
fi

if [[ ! "$file" == *.html ]]; then
    echo "'$file' is not an HTML file."
    gentle_exit
fi

echo "Analyzing '$file'..."
echo " "

if ! grep -Eiq 'lewdity|vrelnir' "$file"; then
    echo "'$file' mentions neither 'lewdity' nor 'vrelnir'."
    read -p "Are you sure this is a Degrees of Lewdity game file? (y/N): " choice
    echo " "
    if [[ ! "${choice-}" =~ ^[Yy] ]]; then
        gentle_exit
    fi
fi

if grep -q 'buttplug-mod/importer.js' "$file"; then
    echo "File contains a Buttplug.io injection."
    read -p "Would you like to uninstall Buttplug.io? (y/N): " choice
    echo " "
    if [[ "${choice-}" =~ ^[Yy] ]]; then
        unpatch "$file"
    else
        echo "Verifying integrity..."
    fi
fi

patch "$file"

gentle_exit
