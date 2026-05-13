const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const driveDir = path.join(os.homedir(), 'drive');

console.log(`Setting up Google Drive sync for ${driveDir}...`);

// Create the drive directory if it doesn't exist
if (!fs.existsSync(driveDir)) {
	fs.mkdirSync(driveDir, { recursive: true });
	console.log(`Created directory: ${driveDir}`);
}

try {
	// Check if rclone is installed
	execSync('rclone --version', { stdio: 'ignore' });
} catch (e) {
	console.error('rclone could not be found. Please ensure it is installed from the software.csv list (e.g., using yay -S rclone).');
	process.exit(1);
}

try {
	console.log('\nConfiguring rclone... Your browser should open momentarily for authentication.');
	console.log('If your browser does not open automatically, CTRL+Click the link printed below starting with "http://127.0.0.1:..."\n');

	// Auto-configure the rclone Google Drive remote
	execSync('rclone config create gdrive drive scope "drive"', { stdio: 'inherit' });
} catch (error) {
	console.error('\nAn error occurred during the rclone setup process.');
	process.exit(1);
}

// 2. Check if it's already mounted
let isMounted = false;
try {
	// Check if the directory is currently a mount point
	const mounts = execSync('mount', { stdio: 'pipe' }).toString();
	if (mounts.includes(driveDir)) isMounted = true;
} catch (error) {
	// Fallback if mount command fails
}

if (!isMounted) {
	console.log('\nMounting Google Drive...');
	try {
		execSync(`rclone mount gdrive: ${driveDir} --daemon --vfs-cache-mode writes`, { stdio: 'inherit' });
		console.log('Successfully mounted!');
	} catch (e) {
		console.error('Failed to mount Google Drive.');
	}
} else {
	console.log('\nGoogle Drive is already mounted and ready to use in nautilus!');
}

console.log(`\nTo unmount anytime, run: fusermount -u ${driveDir}`);
