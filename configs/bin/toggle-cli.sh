#!/bin/bash
WINDOW_CLASS="arch-hypr-cli"
CLI_PATH="$HOME/dev/arch-hypr/cli.js"

ADDR=$(hyprctl clients -j | jq -r ".[] | select(.class==\"$WINDOW_CLASS\") | .address" | head -n1)

if [ "$1" = "kill" ]; then
        if [ -n "$ADDR" ]; then
                hyprctl dispatch closewindow address:"$ADDR" >/dev/null
        fi
        exit 0
fi

if [ -n "$ADDR" ]; then
        WORKSPACE=$(hyprctl clients -j | jq -r ".[] | select(.class==\"$WINDOW_CLASS\") | .workspace.name" | head -n1)
        ACTIVE_WORKSPACE=$(hyprctl activeworkspace -j | jq -r '.name')
        
        if [[ "$WORKSPACE" == "special:hide_cli" || "$WORKSPACE" != "$ACTIVE_WORKSPACE" ]]; then
                hyprctl dispatch layoutmsg preselect l >/dev/null
                hyprctl dispatch movetoworkspace "+0,address:$ADDR" >/dev/null
        else
                hyprctl dispatch movetoworkspacesilent "special:hide_cli,address:$ADDR" >/dev/null
        fi
        exit 0
fi

hyprctl dispatch layoutmsg preselect l >/dev/null
kitty --class "$WINDOW_CLASS" node "$CLI_PATH" >/dev/null 2>&1 &
