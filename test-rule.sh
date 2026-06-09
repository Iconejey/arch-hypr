sed -i '/arch-hypr-cli-width/,+5d' configs/hypr/hyprland.conf
cat << 'INNEREOF' >> configs/hypr/hyprland.conf
windowrule {
    name = initial_size_cli
    match:class = ^(arch-hypr-cli)$
    size = 400 100%
}
INNEREOF
hyprctl reload
