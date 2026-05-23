#!/bin/bash

# Toggle script for the arch-hypr-panel

# Precise ways to check running status
PANEL_PID=$(hyprctl clients -j | jq -r '.[] | select(.title=="arch-hypr-panel") | .pid' | head -n 1)
PROCESS_EXISTS=$(pgrep -f "electron \.")

get_reserved_commands() {
    local left_gap=$1
    local info
    info=$(hyprctl monitors -j | jq -r '.[] | select(.focused)')
    
    local m_name=$(echo "$info" | jq -r '.name')
    local m_width=$(echo "$info" | jq -r '.width')
    local m_height=$(echo "$info" | jq -r '.height')
    local m_rate=$(echo "$info" | jq -r '.refreshRate')
    local m_x=$(echo "$info" | jq -r '.x')
    local m_y=$(echo "$info" | jq -r '.y')
    local m_scale=$(echo "$info" | jq -r '.scale')

    echo "keyword monitor $m_name,${m_width}x${m_height}@${m_rate},${m_x}x${m_y},${m_scale} ; keyword monitor $m_name,addreserved,0,0,${left_gap},0"
}

# If SUPER+A was pressed, or we want to force kill
if [ "$1" == "kill" ]; then
    if [ -n "$PROCESS_EXISTS" ]; then
        pkill -f "electron \."
        # Reset any reserved space on kill
        hyprctl --batch "$(get_reserved_commands 0)" >/dev/null
    else
        cd ~/dev/arch-hypr
        nohup electron . >/dev/null 2>&1 &
        disown
        
        # Wait for window to map, then move it and set reserved space
        for i in {1..30}; do
            sleep 0.1
            if hyprctl clients -j | jq -e '.[] | select(.title=="arch-hypr-panel")' >/dev/null; then
                break
            fi
        done
        hyprctl keyword animations:enabled 0 >/dev/null
        hyprctl --batch "dispatch movewindowpixel exact 0 0,title:^(arch-hypr-panel)$ ; $(get_reserved_commands 390)" >/dev/null
        sleep 0.05
        hyprctl keyword animations:enabled 1 >/dev/null
    fi
    exit 0
fi

# If electron is not running at all, start it
if [ -z "$PROCESS_EXISTS" ]; then
    cd ~/dev/arch-hypr
    nohup electron . >/dev/null 2>&1 &
    disown
    
    # Wait for window to map, then move it and set reserved space
    for i in {1..30}; do
        sleep 0.1
        if hyprctl clients -j | jq -e '.[] | select(.title=="arch-hypr-panel")' >/dev/null; then
            break
        fi
    done
    hyprctl keyword animations:enabled 0 >/dev/null
    hyprctl --batch "dispatch movewindowpixel exact 0 0,title:^(arch-hypr-panel)$ ; $(get_reserved_commands 390)" >/dev/null
    sleep 0.05
    hyprctl keyword animations:enabled 1 >/dev/null
    exit 0
fi

# If it IS running, but window isn't mapped yet, abort and let it load.
if [ -z "$PANEL_PID" ]; then
    exit 0
fi

# If it is running and mapped, toggle position
X_POS=$(hyprctl clients -j | jq -r '.[] | select(.title=="arch-hypr-panel") | .at[0]' | head -n 1)

# Panel width is 390. If it's less than 0, it means it's tucked away. Slide it in to 0
if [ "$X_POS" -lt "0" ]; then
    # Currently hidden -> Slide in to 0
    hyprctl --batch "dispatch movewindowpixel exact 0 0,title:^(arch-hypr-panel)$ ; $(get_reserved_commands 390)" >/dev/null
else
    # Currently visible -> Slide out to -390
    hyprctl --batch "dispatch movewindowpixel exact -390 0,title:^(arch-hypr-panel)$ ; $(get_reserved_commands 0)" >/dev/null
fi

