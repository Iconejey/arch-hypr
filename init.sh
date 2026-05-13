#!/bin/bash

# ANSI Color Codes
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Ensure running as normal user, not root
if [ "$EUID" -eq 0 ]; then
    echo -e "${RED}Please run this script as your normal user. 'yay' cannot be run as root.${NC}"
    exit 1
fi

# Request sudo privileges upfront
echo -e "${YELLOW}Requesting sudo privileges upfront...${NC}"
sudo -v
# Keep sudo credentials alive in the background
while true; do sudo -n true; sleep 60; kill -0 "$$" || exit; done 2>/dev/null &

echo -e "\n${CYAN}========================================${NC}"
echo -e "${CYAN}Starting Installation...${NC}"
echo -e "${CYAN}========================================${NC}\n"

declare -a installed_pkgs
declare -a uninstalled_pkgs
declare -A uninstalled_cmds

# First pass: collect apps and check installation status
while IFS=, read -r pkg cmd; do
    [[ -z "$pkg" ]] && continue
    if [[ "$pkg" == "---TAG_PHASE_2---" ]]; then
        continue
    fi

    # Check if already installed
    is_installed=false
    if pacman -Qq "$pkg" >/dev/null 2>&1; then
        is_installed=true
    elif command -v "$pkg" >/dev/null 2>&1; then
        is_installed=true
    elif [[ "$pkg" == "oh-my-zsh" && -d "$HOME/.oh-my-zsh" ]]; then
        is_installed=true
    fi

    if [ "$is_installed" = true ]; then
        installed_pkgs+=("$pkg")
    else
        uninstalled_pkgs+=("$pkg")
        uninstalled_cmds["$pkg"]="$cmd"
    fi
done < <(tail -n +2 software.csv)

echo -e "\n${CYAN}--- Installation Summary ---${NC}"
echo -e "${GREEN}Already Installed:${NC}"
for p in "${installed_pkgs[@]}"; do echo "  - $p"; done
echo -e "\n${YELLOW}To be Installed:${NC}"
for p in "${uninstalled_pkgs[@]}"; do echo "  - $p"; done
echo -e "${CYAN}----------------------------${NC}\n"

read -p "Do you want to continue with the installation? (y/N) " confirm
if [[ ! $confirm =~ ^[Yy]$ ]]; then
    echo -e "${RED}Installation aborted by user.${NC}"
    exit 1
fi

echo -e "\n${YELLOW}Running full system upgrade...${NC}"
sudo pacman -Syu --noconfirm

# Second pass for installation: actual installation
for pkg in "${uninstalled_pkgs[@]}"; do
    cmd="${uninstalled_cmds[$pkg]}"

    # Formatting command to bypass confirmation
    if [[ "$cmd" == "yay "* ]]; then
        cmd="$cmd --noconfirm --needed --answerdiff None --answerclean None --mflags \"--noconfirm\""
    fi
    if [[ "$cmd" == *"makepkg -si"* ]]; then
        cmd="${cmd/makepkg -si/makepkg -si --noconfirm}"
    fi
    if [[ "$cmd" == *"pacman -S "* ]]; then
        cmd="${cmd/pacman -S /pacman -S --noconfirm }"
    fi
    if [[ "$pkg" == "oh-my-zsh" ]]; then
        cmd='sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended'
    fi

    echo -e "${YELLOW}[ !! ]${NC} Installing $pkg..."
    eval "$cmd"
done

echo -e "\n${CYAN}========================================${NC}"
echo -e "${CYAN}Applying manual configurations...${NC}"
echo -e "${CYAN}========================================${NC}"

echo -e "${YELLOW}Setting up iwd (wifi)...${NC}"
sudo mkdir -p /etc/iwd
sudo cp "$(pwd)/configs/iwd/main.conf" /etc/iwd/main.conf
sudo systemctl enable --now systemd-resolved 2>/dev/null || true
sudo systemctl enable --now systemd-networkd 2>/dev/null || true
sudo ln -sfn /run/systemd/resolve/stub-resolv.conf /etc/resolv.conf
sudo systemctl restart iwd 2>/dev/null || true

echo -e "${YELLOW}Changing default shell to ZSH...${NC}"
sudo chsh -s $(which zsh) "$USER"

echo -e "\n${CYAN}========================================${NC}"
echo -e "${CYAN}Running Configuration Linker...${NC}"
echo -e "${CYAN}========================================${NC}"
# Now node is installed along with the rest, we run link.js
node link.js

echo -e "\n${CYAN}========================================${NC}"
read -p "Do you want to set up Google Drive sync now? (y/N) " run_drive
if [[ $run_drive =~ ^[Yy]$ ]]; then
    echo -e "${CYAN}Setting up Google Drive...${NC}"
    npm run drive-setup
fi

echo -e "\n${CYAN}========================================${NC}"
read -p "Do you want to scan a WiFi QR code to connect to a network now? (y/N) " run_qr
if [[ $run_qr =~ ^[Yy]$ ]]; then
    qr-wifi
fi

echo -e "\n${CYAN}========================================${NC}"
echo -e "${GREEN}Installation Complete!${NC}"
echo -e "${CYAN}========================================${NC}\n"

# Display system info
neofetch

echo -e "\n${YELLOW}Please restart your terminal or log out and log back in to see all changes.${NC}"
exit 0
