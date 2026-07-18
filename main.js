const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const { execSync, exec, spawn } = require('child_process');
const fs = require('fs');

let panelWindow = null;
let clipboardWindow = null;
let lastClipboardShownTime = 0;
let isTargetTerminal = false;

function logPaste(msg) {
	try {
		fs.appendFileSync('/tmp/arch-hypr-paste.log', `[${new Date().toISOString()}] ${msg}\n`);
	} catch (e) {}
}

function detectTargetWindow() {
	isTargetTerminal = false;
	try {
		const activeInfo = execSync('hyprctl activewindow', { encoding: 'utf8' });
		logPaste(`detectTargetWindow raw: ${activeInfo.replace(/\n/g, ' | ')}`);
		const lines = activeInfo.split('\n');
		for (const line of lines) {
			if (line.includes('class:')) {
				const cls = line.split('class:')[1].trim().toLowerCase();
				logPaste(`detectTargetWindow parsed class: ${cls}`);
				if (['kitty', 'terminal', 'foot', 'alacritty', 'wezterm'].some(term => cls.includes(term))) {
					isTargetTerminal = true;
				}
				break;
			}
		}
		logPaste(`detectTargetWindow isTargetTerminal final: ${isTargetTerminal}`);
	} catch (err) {
		logPaste(`detectTargetWindow error: ${err.message}`);
		console.error('Error detecting active window:', err);
	}
}

function createPanelWindow() {
	const { height } = screen.getPrimaryDisplay().workAreaSize;
	const panelWidth = 390; // no spacing
	panelWindow = new BrowserWindow({
		title: 'arch-hypr-panel',
		x: -panelWidth, // Start totally off-screen
		y: 0,
		width: panelWidth + 1,
		height: height,
		frame: false,
		transparent: true,
		hasShadow: false,
		resizable: false,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false
		}
	});

	panelWindow.loadFile('src/index.html');

	panelWindow.on('closed', () => {
		panelWindow = null;
	});
}

function createClipboardWindow() {
	detectTargetWindow();

	if (clipboardWindow) {
		clipboardWindow.show();
		clipboardWindow.focus();
		lastClipboardShownTime = Date.now();
		return;
	}

	const display = screen.getPrimaryDisplay();
	const { width: scrWidth, height: scrHeight } = display.workAreaSize;

	const winWidth = 550;
	const winHeight = 450;
	const x = Math.round((scrWidth - winWidth) / 2);
	const y = Math.round((scrHeight - winHeight) / 2);

	clipboardWindow = new BrowserWindow({
		title: 'Clipboard History',
		x: x,
		y: y,
		width: winWidth,
		height: winHeight,
		frame: false,
		transparent: true,
		alwaysOnTop: true,
		resizable: false,
		skipTaskbar: true,
		hasShadow: true,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false
		}
	});

	clipboardWindow.loadFile('src/clipboard.html');
	lastClipboardShownTime = Date.now();

	// Close on lose focus
	clipboardWindow.on('blur', () => {
		if (Date.now() - lastClipboardShownTime < 1000) {
			// Ignore blur events immediately after showing to prevent compositor focus shifts from closing the window
			return;
		}
		if (clipboardWindow) {
			clipboardWindow.close();
		}
	});

	clipboardWindow.on('closed', () => {
		clipboardWindow = null;
	});
}

// Request single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
	app.quit();
} else {
	// Focus existing instance or show clipboard popup on second instance call
	app.on('second-instance', (event, commandLine, workingDirectory) => {
		if (commandLine.some(arg => arg.includes('--clipboard'))) {
			// Find the --target-class argument
			const targetClassArg = commandLine.find(arg => arg.startsWith('--target-class='));
			if (targetClassArg) {
				const cls = targetClassArg.split('=')[1].toLowerCase();
				logPaste(`Second instance target class received: ${cls}`);
				if (['kitty', 'terminal', 'foot', 'alacritty', 'wezterm'].some(term => cls.includes(term))) {
					isTargetTerminal = true;
				} else {
					isTargetTerminal = false;
				}
				logPaste(`isTargetTerminal set to: ${isTargetTerminal}`);
			} else {
				detectTargetWindow();
			}
			createClipboardWindow();
		} else if (panelWindow) {
			if (panelWindow.isMinimized()) panelWindow.restore();
			panelWindow.focus();
		}
	});

	app.whenReady().then(() => {
		createPanelWindow();

		ipcMain.on('paste-item', (event, id) => {
			logPaste(`Received paste-item with id: ${id}`);
			if (clipboardWindow) {
				logPaste('Closing clipboardWindow');
				clipboardWindow.close();
			}

			const copyCmd = `cliphist decode ${id} | wl-copy`;
			logPaste(`Running copy cmd: ${copyCmd}`);

			exec(copyCmd, (err, stdout, stderr) => {
				if (err) {
					logPaste(`Copy command failed: ${err.message}`);
					return;
				}
				logPaste('Copy command succeeded, waiting 300ms for focus restoration before paste...');

				setTimeout(() => {
					const pasteCmd = isTargetTerminal ? 'wtype -M ctrl -M shift v -m ctrl -m shift' : 'wtype -M ctrl v -m ctrl';
					logPaste(`Running paste cmd: ${pasteCmd}`);
					exec(pasteCmd, (err, stdout, stderr) => {
						if (err) {
							logPaste(`wtype error: ${err.message}`);
						} else {
							logPaste(`wtype success: ${stdout} ${stderr}`);
						}
					});
				}, 300); // Give Hyprland 300ms to unmap clipboard window and restore focus to target
			});
		});

		// Check if first instance itself was started with --clipboard
		if (process.argv.some(arg => arg.includes('--clipboard'))) {
			createClipboardWindow();
		}

		process.on('SIGUSR1', () => {
			if (panelWindow) {
				panelWindow.webContents.send('panel-visible');
			}
		});

		process.on('SIGUSR2', () => {
			if (panelWindow) {
				panelWindow.webContents.send('panel-hidden');
			}
		});
	});
}

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit();
	}
});

app.on('activate', () => {
	if (BrowserWindow.getAllWindows().length === 0) {
		createPanelWindow();
	}
});
