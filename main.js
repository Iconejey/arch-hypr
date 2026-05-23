const { app, BrowserWindow, screen } = require('electron');
const path = require('path');

function createWindow() {
	const { height } = screen.getPrimaryDisplay().workAreaSize;
	const panelWidth = 350; // no spacing
	const win = new BrowserWindow({
		title: 'arch-hypr-panel',
		x: -panelWidth, // Start totally off-screen
		y: 0,
		width: panelWidth,
		height: height,
		frame: false,
		transparent: true,
		resizable: true,
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
