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
if [[ "$1" == "--final" ]]; then
    echo -e "${CYAN}Starting Phase 2 Installation...${NC}"
else
    echo -e "${CYAN}Starting Phase 1 (Core) Installation...${NC}"
fi
echo -e "${CYAN}========================================${NC}\n"

SEEN_TAG=false

# Process software.csv
tail -n +2 software.csv | while IFS=, read -r pkg cmd; do
    # Skip empty lines
    [[ -z "$pkg" ]] && continue

    # Check for the phase separator tag
    if [[ "$pkg" == "---TAG_PHASE_2---" ]]; then
        SEEN_TAG=true
        continue
    fi

    # Phase 1 logic: break if we hit the tag
    if [[ "$1" != "--final" && "$SEEN_TAG" == true ]]; then
        break
    fi

    # Phase 2 logic: continue skipping lines until we hit the tag
    if [[ "$1" == "--final" && "$SEEN_TAG" == false ]]; then
        continue
    fi

    # Formatting command to bypass confirmation
    if [[ "$cmd" == "yay "* ]]; then
        cmd="$cmd --noconfirm --needed --noprovides --answerdiff None --answerclean None --mflags \"--noconfirm\""
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
        echo -e "${GREEN}[ OK ]${NC} $pkg is already installed."
    else
        echo -e "${YELLOW}[ !! ]${NC} Installing $pkg..."
        eval "$cmd"
    fi
done

if [[ "$1" != "--final" ]]; then
    echo -e "\n${CYAN}========================================${NC}"
    echo -e "${CYAN}Applying manual configurations...${NC}"
    echo -e "${CYAN}========================================${NC}"
    # Manually link configurations so the new terminal looks right immediately
    mkdir -p ~/.config/hypr ~/.config/kitty
    ln -sfn "$(pwd)/configs/hypr/hyprland.conf" ~/.config/hypr/hyprland.conf
    ln -sfn "$(pwd)/configs/kitty/kitty.conf" ~/.config/kitty/kitty.conf
    ln -sfn "$(pwd)/configs/zsh/.zshrc" ~/.zshrc

    echo -e "${YELLOW}Changing default shell to ZSH...${NC}"
    sudo chsh -s $(which zsh) "$USER"

    echo -e "\n${CYAN}========================================${NC}"
    echo -e "${CYAN}Spawning final terminal with ZSH theme...${NC}"
    echo -e "${CYAN}========================================${NC}"
    # Open Kitty -> Launch Phase 2 of this script script -> drop into your native ZSH shell
    nohup kitty bash -c "$(pwd)/init.sh --final; exec zsh" >/dev/null 2>&1 &
    exit 0
else
    echo -e "\n${CYAN}========================================${NC}"
    echo -e "${CYAN}Running Configuration Linker...${NC}"
    echo -e "${CYAN}========================================${NC}"
    # Now node is installed along with the rest, we run link.js
    node link.js

    echo -e "\n${CYAN}========================================${NC}"
    echo -e "${GREEN}Installation Complete!${NC}"
    echo -e "${CYAN}========================================${NC}\n"
    # Display system info
    neofetch
fi
