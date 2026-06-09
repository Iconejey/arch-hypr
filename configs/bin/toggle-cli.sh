#!/bin/bash

WINDOW_TITLE="arch-hypr-cli"
CLI_PATH="$HOME/dev/arch-hypr/cli.js"

ADDR=$(hyprctl clients -j | jq -r ".[] | select(.title==\"$WINDOW_TITLE\") | .address" | head -n1)

if [ "$1" = "kill" ]; then
	if [ -n "$ADDR" ]; then
		hyprctl dispatch closewindow address:"$ADDR" >/dev/null
	fi
	exit 0
fi

if [ -n "$ADDR" ]; then
	hyprctl dispatch closewindow address:"$ADDR" >/dev/null
	exit 0
fi

kitty --title "$WINDOW_TITLE" node "$CLI_PATH" >/dev/null 2>&1 &

for i in {1..30}; do
	sleep 0.1
	ADDR=$(hyprctl clients -j | jq -r ".[] | select(.title==\"$WINDOW_TITLE\") | .address" | head -n1)
	if [ -n "$ADDR" ]; then
		hyprctl --batch "dispatch focuswindow address:$ADDR ; dispatch movewindow l" >/dev/null
		break
	fi
done
