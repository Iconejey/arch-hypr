const { app, BrowserWindow, screen } = require('electron');
const path = require('path');

function createWindow() {
	const { height } = screen.getPrimaryDisplay().workAreaSize;
	const panelWidth = 390; // no spacing
	const win = new BrowserWindow({
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

	win.loadFile('src/index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit();
	}
});

app.on('activate', () => {
	if (BrowserWindow.getAllWindows().length === 0) {
		createWindow();
	}
});
