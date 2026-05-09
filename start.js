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
		console.log(`🔗 Linking ${name} config to ${dest}`);
		execSync(`ln -s "${source}" "${dest}"`);
		console.log(`✅ Successfully applied ${name} config.`);
	} catch (error) {
		console.error(`❌ Failed to apply ${name} config:`, error.message);
	}
}

console.log('🚀 Starting configuration application...\n');

if (fs.existsSync(source_dir)) {
	const config_items = fs.readdirSync(source_dir);
	for (const item_name of config_items) {
		const source_path = path.join(source_dir, item_name);
		const dest_path = path.join(config_dir, item_name);
		applyConfig(source_path, dest_path, item_name);
	}
} else {
	console.error(`❌ Source directory ${source_dir} does not exist.`);
}

console.log('\n🎉 Done!');
