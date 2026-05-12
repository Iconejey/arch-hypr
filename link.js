const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const config_dir = path.join(os.homedir(), '.config');
const source_dir = path.join(__dirname, 'configs');

function applyConfig(source, dest, name) {
	if (!fs.existsSync(source)) {
		console.error(`❌ Source for ${name} not found at ${source}`);
		return;
	}

	// Backup existing configuration if it exists and is not a symlink to our source
	if (fs.existsSync(dest) || fs.lstatSync(dest, { throwIfNoEntry: false })) {
		const is_symlink = fs.lstatSync(dest).isSymbolicLink();
		if (is_symlink) {
			const link_target = fs.readlinkSync(dest);
			if (link_target === source) {
				console.log(`✅ ${name} config is already linked correctly.`);
				return;
			}
		}

		const backup_path = `${dest}.backup-${Date.now()}`;
		console.log(`⚠️ Backing up existing ${name} config to ${backup_path}`);
		fs.renameSync(dest, backup_path);
	}

	// Apply new configuration via symlink
	try {
		console.log(`* Linking ${name} config to ${dest}`);
		execSync(`ln -s "${source}" "${dest}"`);
		console.log(`✅ Successfully applied ${name} config.`);
	} catch (error) {
		console.error(`❌ Failed to apply ${name} config:`, error.message);
	}
}

console.log('* Starting configuration application...\n');

if (fs.existsSync(source_dir)) {
	const config_items = fs.readdirSync(source_dir);
	for (const item_name of config_items) {
		const source_path = path.join(source_dir, item_name);
		if (item_name === 'iwd') {
			const iwd_source = path.join(source_path, 'main.conf');
			const iwd_dest = '/etc/iwd/main.conf';
			try {
				console.log(`* Linking iwd config to ${iwd_dest} (requires sudo)`);
				execSync(`sudo mkdir -p /etc/iwd`);
				execSync(`sudo rm -f "${iwd_dest}" && sudo cp "${iwd_source}" "${iwd_dest}"`);
				execSync(`sudo systemctl enable --now systemd-resolved 2>/dev/null || true`);
                                execSync(`sudo systemctl enable --now systemd-networkd 2>/dev/null || true`);
                                execSync(`sudo ln -sfn /run/systemd/resolve/stub-resolv.conf /etc/resolv.conf`);
				execSync(`sudo systemctl restart iwd 2>/dev/null || true`);
				console.log(`✅ Successfully applied iwd config.`);
			} catch (err) {
				console.error(`❌ Failed to apply iwd config:`, err.message);
			}
			continue;
		}

		if (item_name === 'zsh') {
			const zshrc_source = path.join(source_path, '.zshrc');
			const zshrc_dest = path.join(os.homedir(), '.zshrc');
			applyConfig(zshrc_source, zshrc_dest, '.zshrc');
			continue;
		}

		if (item_name === 'vscode') {
			const vscode_source_settings = path.join(source_path, 'settings.json');
			const vscode_dest_settings = path.join(config_dir, 'Code', 'User', 'settings.json');
			const vscode_source_keybindings = path.join(source_path, 'keybindings.json');
			const vscode_dest_keybindings = path.join(config_dir, 'Code', 'User', 'keybindings.json');

			// Ensure the target directory exists
			const dest_dir = path.dirname(vscode_dest_settings);
			if (!fs.existsSync(dest_dir)) {
				fs.mkdirSync(dest_dir, { recursive: true });
			}

			applyConfig(vscode_source_settings, vscode_dest_settings, 'vscode settings.json');
			applyConfig(vscode_source_keybindings, vscode_dest_keybindings, 'vscode keybindings.json');
			continue;
		}

		const dest_path = path.join(config_dir, item_name);
		applyConfig(source_path, dest_path, item_name);
	}
} else {
	console.error(`❌ Source directory ${source_dir} does not exist.`);
}

console.log('\nDone!');
