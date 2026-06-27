# Autostart Hyprland via UWSM when logging in on TTY1
if uwsm check may-start; then
    exec uwsm start hyprland-uwsm.desktop
fi
