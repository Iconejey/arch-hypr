#!/bin/bash

# ANSI Color Codes
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BANNER='\033[30;43m' # Black fg, Yellow bg
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

echo -e "\n${BANNER}                            ${NC}"
echo -e "${BANNER}  Starting Installation...  ${NC}"
echo -e "${BANNER}                            ${NC}\n"

declare -a all_pkgs_status
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
        all_pkgs_status+=("${GREEN}  - $pkg${NC}")
    else
        uninstalled_pkgs+=("$pkg")
        uninstalled_cmds["$pkg"]="$cmd"
        all_pkgs_status+=("${YELLOW}  - $pkg${NC}")
    fi
done < <(tail -n +2 software.csv)

echo -e "\n${CYAN}--- Packages Status ---${NC}"
for status in "${all_pkgs_status[@]}"; do echo -e "$status"; done
echo -e "${CYAN}-----------------------${NC}\n"

if [ ${#uninstalled_pkgs[@]} -eq 0 ]; then
    echo -e "${GREEN}All software.csv packages are already installed!${NC}"
else
    echo -en "\n${YELLOW}Do you want to continue with the installation of the missing packages? (y/N) ${NC}"
    read confirm
    if [[ ! $confirm =~ ^[Yy]$ ]]; then
        echo -e "${RED}Installation aborted by user.${NC}"
        exit 1
    fi

    echo -e "\n${YELLOW}Running full system upgrade (this may take a while)...${NC}"
    if ! upgrade_output=$(sudo pacman -Syu --noconfirm 2>&1); then
        echo -e "${RED}System upgrade failed! Error output:${NC}"
        echo "$upgrade_output"
    else
        echo -e "${GREEN}System upgrade completed successfully.${NC}"
    fi

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

        echo -en "${YELLOW}[ .. ]${NC} Installing $pkg... "
        if ! install_output=$(eval "$cmd" 2>&1); then
            echo -e "\n${RED}[ FF ] Failed to install $pkg! Error output:${NC}"
            echo "$install_output"
        else
            echo -e "\r${GREEN}[ OK ]${NC} Installing $pkg... Done."
        fi
    done
fi

echo -e "\n${BANNER}                                     ${NC}"
echo -e "${BANNER}  Applying manual configurations...  ${NC}"
echo -e "${BANNER}                                     ${NC}\n"

echo -e "${YELLOW}Setting up iwd (wifi)...${NC}"
sudo mkdir -p /etc/iwd
sudo cp "$(pwd)/configs/iwd/main.conf" /etc/iwd/main.conf
sudo systemctl enable --now systemd-resolved 2>/dev/null || true
sudo systemctl enable --now systemd-networkd 2>/dev/null || true
sudo ln -sfn /run/systemd/resolve/stub-resolv.conf /etc/resolv.conf
sudo systemctl restart iwd 2>/dev/null || true

echo -e "${YELLOW}Changing default shell to ZSH...${NC}"
sudo chsh -s $(which zsh) "$USER"

echo -e "\n${BANNER}                                   ${NC}"
echo -e "${BANNER}  Running Configuration Linker...  ${NC}"
echo -e "${BANNER}                                   ${NC}\n"
# Now node is installed along with the rest, we run link.js
node link.js

echo -e "\n${YELLOW}Making Chrome smart globally for Hyprland...${NC}"
mkdir -p ~/.local/share/applications
# Create a local override for Chrome's desktop profiles if they are installed
for chrome_desktop in google-chrome.desktop com.google.Chrome.desktop; do
    if [ -f /usr/share/applications/$chrome_desktop ]; then
        cp /usr/share/applications/$chrome_desktop ~/.local/share/applications/$chrome_desktop
        # Replace calls to the original chrome executable directly with our smart wrapper and add the password store flag
        sed -i "s|^Exec=/usr/bin/google-chrome-stable|Exec=$HOME/.local/bin/smart-chrome --password-store=gnome|g" ~/.local/share/applications/$chrome_desktop
    fi
done

# Set them as default for XDG globally
xdg-settings set default-web-browser google-chrome.desktop 2>/dev/null || true
update-desktop-database ~/.local/share/applications 2>/dev/null || true

echo -en "\n${YELLOW}Do you want to set up Google Drive sync now? (y/N) ${NC}"
read run_drive
if [[ $run_drive =~ ^[Yy]$ ]]; then
    echo -e "${CYAN}Setting up Google Drive...${NC}"
    npm run drive-setup
fi

echo -en "\n${YELLOW}Do you want to scan a WiFi QR code to connect to a network now? (y/N) ${NC}"
read run_qr
if [[ $run_qr =~ ^[Yy]$ ]]; then
    qr-wifi
fi

echo -en "\n${YELLOW}Do you want to enroll your fingerprint for biometry authentication now? (y/N) ${NC}"
read run_fprint
if [[ $run_fprint =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Starting fingerprint service...${NC}"
    # fprintd is DBus activated, so just starting it or interacting with it is enough
    sudo systemctl restart fprintd
    
    echo -e "${YELLOW}Please swipe your finger on the fingerprint reader...${NC}"
    sudo fprintd-enroll "$USER"
    
    echo -e "${YELLOW}Configuring sudo to use fingerprint authentication...${NC}"
    # Add pam_fprintd.so to /etc/pam.d/sudo if not already present
    if ! grep -q "pam_fprintd.so" /etc/pam.d/sudo; then
        sudo sed -i '1s/^/auth            sufficient      pam_fprintd.so\n/' /etc/pam.d/sudo
        echo -e "${GREEN}Sudo configured for fingerprint!${NC}"
    else
        echo -e "${GREEN}Sudo is already configured for fingerprint.${NC}"
    fi
fi

echo -e "\n${BANNER}                          ${NC}"
echo -e "${BANNER}  Installation Complete!  ${NC}"
echo -e "${BANNER}                          ${NC}\n"

# Display system info
neofetch

echo -e "\n${YELLOW}Please restart your terminal or log out and log back in to see all changes.${NC}"
exit 0
