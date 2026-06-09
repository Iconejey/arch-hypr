#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec, spawn, spawnSync } = require('child_process');
const blessed = require('neo-neo-blessed');

const state = {
	now: new Date(),
	battery: { percent: null, status: 'Unknown', time: '--:--' },
	wifi: { connected: false, ssid: 'Disconnected', stars: '', device: null },
	bluetooth: { connectedNames: [], connectedMacs: new Set() },
	brightness: { percent: 0 },
	volume: { percent: 0, muted: false },
	media: { playing: false, title: '', artist: '', progress: 0 },
	wifiNetworks: [],
	bluetoothDevices: [],
	apps: []
};

let mode = 'home';
let homeSelection = 0;
let submenuSelection = 0;
let appSearchSelection = 0;
let appSearchQuery = '';
let currentSubmenu = null;
let message = '';
let messageType = 'info';
let isBusy = false;

const appDirs = ['/usr/share/applications/', path.join(os.homedir(), '.local/share/applications/')];

const screen = blessed.screen({
	smartCSR: true,
	title: 'arch-hypr cli',
	fullUnicode: true,
	warnings: true
});

const headerBox = blessed.box({
	parent: screen,
	top: 0,
	left: 0,
	width: '100%',
	height: 3,
	tags: true
});

const mainList = blessed.list({
	parent: screen,
	top: 3,
	left: 0,
	width: '100%',
	height: '100%-4',
	keys: true,
	vi: true,
	tags: true,
	style: {
		selected: {
			bg: '#005f00',
			fg: 'white'
		},
		item: {
			fg: '#eeeeee'
		}
	}
});

const messageBox = blessed.box({
	parent: screen,
	bottom: 0,
	left: 0,
	width: '100%',
	height: 1,
	tags: true,
	content: ''
});

function setMessage(text, type = 'info') {
	message = text;
	messageType = type;
	render();
}

async function withSuspendedUI(command) {
	isBusy = true;
	try {
		screen.leave();
		spawnSync(
			'bash',
			[
				'-lc',
				`${command}
echo
read -r -p "Press Enter to return..." _`
			],
			{ stdio: 'inherit' }
		);
	} finally {
		isBusy = false;
		screen.enter();
		render();
	}
}

function progressLine(content, progress) {
	const width = Math.max(20, (screen.width || 100) - 4);
	const body = content.length >= width ? content.slice(0, width) : content + ' '.repeat(width - content.length);

	if (typeof progress !== 'number') return `{white-fg}${body}{/}`;

	const clamped = Math.max(0, Math.min(1, progress));
	const split = Math.round(width * clamped);
	const done = body.slice(0, split);
	const todo = body.slice(split);
	return `{#444-bg}{white-fg}${done}{/}{#222-bg}{white-fg}${todo}{/}`;
}

function run(cmd) {
	return new Promise(resolve => {
		exec(cmd, { shell: '/bin/bash' }, (error, stdout = '', stderr = '') => {
			resolve({
				ok: !error,
				stdout: stdout.trim(),
				stderr: stderr.trim(),
				error
			});
		});
	});
}

function runArgs(command, args = []) {
	return new Promise(resolve => {
		const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', d => (stdout += d.toString()));
		child.stderr.on('data', d => (stderr += d.toString()));
		child.on('close', code => {
			resolve({
				ok: code === 0,
				stdout: stdout.trim(),
				stderr: stderr.trim(),
				error: code === 0 ? null : new Error(`${command} exited with ${code}`)
			});
		});
	});
}

function parseStationStatus(stdout) {
	return stdout.replace(/\x1b\[[0-9;]*m/g, '').match(/^\s*([a-zA-Z0-9_]+)\s+(connected|disconnected|connecting)/m);
}

function isSafeMac(mac) {
	return /^[A-F0-9:]{17}$/i.test(mac);
}

function isSafeNetworkName(name) {
	return typeof name === 'string' && name.length > 0 && !/[\x00-\x1f\x7f]/.test(name);
}

function parseDesktopFile(filePath) {
	try {
		const lines = fs.readFileSync(filePath, 'utf8').split('\n');
		let inDesktop = false;
		let name;
		let execCmd;
		let noDisplay = false;
		for (const line of lines) {
			const l = line.trim();
			if (!l) continue;
			if (l.startsWith('[')) {
				inDesktop = l === '[Desktop Entry]';
				continue;
			}
			if (!inDesktop) continue;
			if (l.startsWith('Name=') && !name) name = l.slice(5).trim();
			if (l.startsWith('Exec='))
				execCmd = l
					.slice(5)
					.replace(/%[a-zA-Z]+/g, '')
					.trim();
			if (l.startsWith('NoDisplay=') && l.slice(10).trim().toLowerCase() === 'true') noDisplay = true;
		}
		if (!name || !execCmd || noDisplay) return null;
		return { name, exec: execCmd, desktop: path.basename(filePath, '.desktop') };
	} catch (e) {
		return null;
	}
}

function loadApps() {
	const apps = [];
	for (const dir of appDirs) {
		if (!fs.existsSync(dir)) continue;
		for (const file of fs.readdirSync(dir)) {
			if (!file.endsWith('.desktop')) continue;
			const app = parseDesktopFile(path.join(dir, file));
			if (app && !apps.find(a => a.name === app.name)) apps.push(app);
		}
	}
	apps.sort((a, b) => a.name.localeCompare(b.name));
	state.apps = apps;
}

function filteredApps() {
	if (!appSearchQuery) return [];
	const q = appSearchQuery.toLowerCase();
	const list = state.apps.filter(app => app.name.toLowerCase().includes(q));
	list.sort((a, b) => {
		const as = a.name.toLowerCase().startsWith(q);
		const bs = b.name.toLowerCase().startsWith(q);
		if (as && !bs) return -1;
		if (!as && bs) return 1;
		return a.name.localeCompare(b.name);
	});
	return list;
}

function launchApp(app) {
	if (!app) return;
	if (!/^[a-zA-Z0-9._-]+$/.test(app.desktop)) {
		setMessage('Unsafe desktop entry identifier', 'error');
		return;
	}
	const child = spawn('gtk-launch', [app.desktop], { detached: true, stdio: 'ignore' });
	child.unref();
	screen.destroy();
	state.battery.status = match[1].trim();
	state.battery.percent = parseInt(match[2], 10);
	state.battery.time = match[3] || 'N/A';
}

async function updateWifi() {
	const stationList = await run('iwctl station list');
	if (!stationList.ok || !stationList.stdout) return;
	const station = parseStationStatus(stationList.stdout);
	if (!station) return;
	const device = station[1];
	state.wifi.device = device;

	const details = await run(`iwctl station ${device} show`);
	if (!details.ok || !details.stdout) {
		state.wifi.connected = false;
		state.wifi.ssid = 'Disconnected';
		state.wifi.stars = '';
		return;
	}

	const pure = details.stdout.replace(/\x1b\[[0-9;]*m/g, '');
	const networkMatch = pure.match(/Connected network\s+(.*)/);
	const rssiMatch = pure.match(/RSSI\s+(-?\d+)\s+dBm/);
	if (!networkMatch) {
		state.wifi.connected = false;
		state.wifi.ssid = 'Disconnected';
		state.wifi.stars = '';
		return;
	}

	state.wifi.connected = true;
	state.wifi.ssid = networkMatch[1].trim();
	if (!rssiMatch) state.wifi.stars = '**';
	else {
		const rssi = parseInt(rssiMatch[1], 10);
		if (rssi > -55) state.wifi.stars = '****';
		else if (rssi > -65) state.wifi.stars = '***';
		else if (rssi > -75) state.wifi.stars = '**';
		else state.wifi.stars = '*';
	}
}

async function updateWifiNetworks() {
	if (!state.wifi.device) return;
	const res = await run(`iwctl station ${state.wifi.device} get-networks`);
	if (!res.ok || !res.stdout) return;
	const lines = res.stdout.split('\n').map(l => l.replace(/\x1b\[[0-9;]*m/g, ''));
	const header = lines.find(l => l.includes('Network name'));
	if (!header) return;

	const ns = header.indexOf('Network name');
	const ss = header.indexOf('Security');
	const sig = header.indexOf('Signal');
	const hi = lines.indexOf(header);
	const list = [];
	for (let i = hi + 2; i < lines.length; i++) {
		const line = lines[i];
		if (!line || !line.trim() || line.includes('---')) continue;
		const name = line.substring(ns, ss).trim();
		if (!name) continue;
		const connected = line.substring(0, ns).includes('>');
		if (connected) continue;
		const stars = line.substring(sig).trim();
		list.push({ name, stars });
	}
	state.wifiNetworks = list;
}

async function updateBluetooth() {
	const connected = await run('bluetoothctl devices Connected');
	const lines = connected.stdout
		.split('\n')
		.map(l => l.trim())
		.filter(l => l.startsWith('Device'));
	state.bluetooth.connectedNames = [];
	state.bluetooth.connectedMacs = new Set();
	for (const line of lines) {
		const m = line.match(/Device\s+([A-F0-9:]+)\s+(.*)/i);
		if (!m) continue;
		state.bluetooth.connectedMacs.add(m[1]);
		state.bluetooth.connectedNames.push(m[2]);
	}

	const all = await run('bluetoothctl devices');
	const devices = all.stdout
		.split('\n')
		.map(l => l.trim())
		.filter(l => l.startsWith('Device'))
		.map(line => {
			const m = line.match(/Device\s+([A-F0-9:]+)\s+(.*)/i);
			return m ? { mac: m[1], name: m[2] } : null;
		})
		.filter(Boolean);
	state.bluetoothDevices = devices;
}

async function updateBrightness() {
	const res = await run('brightnessctl i');
	const match = res.stdout.match(/\((\d+)%\)/);
	if (match) state.brightness.percent = parseInt(match[1], 10);
}

async function updateVolume() {
	const res = await run('wpctl get-volume @DEFAULT_AUDIO_SINK@');
	const match = res.stdout.match(/Volume:\s+([0-9.]+)/);
	if (match) state.volume.percent = Math.round(parseFloat(match[1]) * 100);
	state.volume.muted = res.stdout.includes('[MUTED]');
}

async function updateMedia() {
	const statusRes = await run('playerctl status');
	if (!statusRes.ok) {
		state.media.playing = false;
		return;
	}
	const status = statusRes.stdout.trim();
	state.media.playing = status === 'Playing';
	if (status !== 'Playing') return;

	const meta = await run("playerctl metadata --format '{{title}};;{{artist}};;{{mpris:length}}'");
	const [title = '', artist = '', lenRaw = '0'] = meta.stdout.split(';;');
	state.media.title = title.trim() || 'Unknown title';
	state.media.artist = artist.trim();
	const length = parseInt(lenRaw, 10) / 1000000;
	const posRes = await run('playerctl position');
	const position = parseFloat(posRes.stdout || '0');
	state.media.progress = length > 0 ? Math.max(0, Math.min(1, position / length)) : 0;
}

async function refreshState() {
	state.now = new Date();
	await Promise.all([updateBattery(), updateWifi(), updateBluetooth(), updateBrightness(), updateVolume(), updateMedia()]);
	if (mode === 'wifi-list') await updateWifiNetworks();
	render();
}

function adjustBrightness(delta) {
	const cmd = delta > 0 ? 'brightnessctl -e4 -n2 set 5%+' : 'brightnessctl -e4 -n2 set 5%-';
	run(cmd).then(updateBrightness).then(render);
}

function adjustVolume(delta) {
	const cmd = delta > 0 ? 'wpctl set-volume -l 1 @DEFAULT_AUDIO_SINK@ 5%+' : 'wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%-';
	run(cmd).then(updateVolume).then(render);
}

let homeItems = [];
let submenuItems = [];

function render() {
	if (mode === 'home') renderHome();
	else if (mode === 'submenu') renderSubmenu();
	else if (mode === 'wifi-list') renderWifiList();
	else if (mode === 'bluetooth-list') renderBluetoothList();
	else if (mode === 'app-search') renderAppSearch();

	if (message) {
		messageBox.content = messageType === 'error' ? `{#ff5f5f-fg}${message}{/}` : `{gray-fg}${message}{/}`;
	} else {
		messageBox.content = '';
	}
	screen.render();
}

function renderHome() {
	headerBox.content = '{#87ff5f-fg}arch-hypr cli{/}\n{gray-fg}↑↓ select · Enter/Space open · Type to search apps · Esc exit{/}';
	const time = state.now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	const date = state.now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
	homeItems = [];

	homeItems.push({
		label: `Clock & date  ${time}  ${date}`,
		progress: null,
		onEnter: openPowerMenu
	});
	homeItems.push({
		label: `Battery  ${state.battery.percent ?? '--'}%  ${state.battery.time}`,
		progress: typeof state.battery.percent === 'number' ? state.battery.percent / 100 : 0,
		onEnter: openBatteryMenu
	});
	homeItems.push({
		label: `Wifi  ${state.wifi.ssid}${state.wifi.stars ? `  ${state.wifi.stars}` : ''}`,
		progress: null,
		onEnter: openWifiMenu
	});
	homeItems.push({
		label: `Bluetooth  ${state.bluetooth.connectedNames.length ? state.bluetooth.connectedNames.join(', ') : 'No device'}`,
		progress: null,
		onEnter: openBluetoothMenu
	});
	homeItems.push({
		label: `Brightness  ${state.brightness.percent}%`,
		progress: state.brightness.percent / 100,
		onLeft: () => adjustBrightness(-1),
		onRight: () => adjustBrightness(1),
		onEnter: openDisplayMenu
	});
	homeItems.push({
		label: `Volume  ${state.volume.percent}%${state.volume.muted ? ' (muted)' : ''}`,
		progress: state.volume.percent / 100,
		onLeft: () => adjustVolume(-1),
		onRight: () => adjustVolume(1),
		onEnter: openAudioMenu
	});
	if (state.media.playing) {
		homeItems.push({
			label: `Media  ${state.media.title}${state.media.artist ? ` - ${state.media.artist}` : ''}`,
			progress: state.media.progress,
			onLeft: () => run('playerctl previous'),
			onRight: () => run('playerctl next'),
			onEnter: () => run('playerctl play-pause')
		});
	}

	mainList.setItems(homeItems.map(item => progressLine(item.label, item.progress)));
}

function renderSubmenu() {
	headerBox.content = `{#87ff5f-fg}${currentSubmenu.title}{/}\n{gray-fg}↑↓ select · Enter/Space run · Esc back{/}`;
	submenuItems = currentSubmenu.items;
	mainList.setItems(submenuItems.map(item => item.label));
}

function renderWifiList() {
	headerBox.content = '{#87ff5f-fg}Wifi networks{/}\n{gray-fg}↑↓ select · Enter connect · Esc back{/}';
	if (!state.wifiNetworks.length) {
		mainList.setItems(['{gray-fg}No network found{/}']);
	} else {
		mainList.setItems(state.wifiNetworks.map(net => `${net.name}  ${net.stars}`));
	}
}

function renderBluetoothList() {
	headerBox.content = '{#87ff5f-fg}Bluetooth devices{/}\n{gray-fg}↑↓ select · Enter connect/disconnect · Esc back{/}';
	if (!state.bluetoothDevices.length) {
		mainList.setItems(['{gray-fg}No Bluetooth devices found{/}']);
	} else {
		mainList.setItems(
			state.bluetoothDevices.map(device => {
				const status = state.bluetooth.connectedMacs.has(device.mac) ? 'connected' : 'disconnected';
				return `${device.name} (${status})`;
			})
		);
	}
}

function renderAppSearch() {
	headerBox.content = `{#87ff5f-fg}App search{/}\n{gray-fg}Type to filter · ↑↓ select · Enter launch+close · Esc cancel\nQuery: ${appSearchQuery}{/}`;
	const apps = filteredApps();
	if (!apps.length) {
		mainList.setItems(['{gray-fg}No app found{/}']);
	} else {
		mainList.setItems(apps.slice(0, 12).map(app => app.name));
	}
}

function openPowerMenu() {
	mode = 'submenu';
	currentSubmenu = {
		title: 'Power actions',
		items: [
			{ label: 'Shut down', action: () => run('systemctl poweroff') },
			{ label: 'Sleep', action: () => run('systemctl suspend') },
			{ label: 'Restart', action: () => run('systemctl reboot') }
		]
	};
	mainList.select(0);
}

function openBatteryMenu() {
	mode = 'submenu';
	currentSubmenu = {
		title: 'Battery power profile',
		items: [
			{ label: 'Eco (power-saver)', action: () => run('powerprofilesctl set power-saver') },
			{ label: 'Auto (balanced)', action: () => run('powerprofilesctl set balanced') },
			{ label: 'Performance', action: () => run('powerprofilesctl set performance') }
		]
	};
	mainList.select(0);
}

function openWifiMenu() {
	mode = 'submenu';
	currentSubmenu = {
		title: 'Wifi actions',
		items: [
			{
				label: 'List networks',
				action: async () => {
					await updateWifiNetworks();
					mode = 'wifi-list';
					mainList.select(0);
				}
			},
			{
				label: 'Scan QR code (qr-wifi)',
				action: () => withSuspendedUI('qr-wifi')
			},
			{
				label: 'Share current network QR',
				action: () =>
					withSuspendedUI(`
station=$(iwctl station list | sed 's/\\x1b\\[[0-9;]*m//g' | awk '/connected/ {print $1; exit}')
if [ -z "$station" ]; then
  echo "No connected wifi station found."
  exit 0
fi
case "$station" in
  (*[!a-zA-Z0-9_]*|'') echo "Unsafe wifi station identifier."; exit 1 ;;
esac
network=$(iwctl station "$station" show | sed 's/\\x1b\\[[0-9;]*m//g' | sed -n 's/^\\s*Connected network\\s\\+//p' | head -n1)
if [ -z "$network" ]; then
  echo "No connected network."
  exit 0
fi
case "$network" in
  (*[![:alnum:]_. -]*|*".."*|*"/"*|*"\\"*) echo "Unsafe network name."; exit 1 ;;
esac
psk_file="/var/lib/iwd/${network}.psk"
if [ -r "$psk_file" ]; then
  psk=$(sed -n 's/^Passphrase=//p' "$psk_file" | head -n1)
else
  psk=$(sudo cat "$psk_file" 2>/dev/null | sed -n 's/^Passphrase=//p' | head -n1)
fi
escape_qr() {
  printf '%s' "$1" | sed 's/\\\\/\\\\\\\\/g; s/;/\\\\;/g; s/:/\\\\:/g; s/,/\\\\,/g'
}
payload="WIFI:T:WPA;S:$(escape_qr "$network");P:$(escape_qr "$psk");;"
echo "Network: $network"
if command -v qrencode >/dev/null 2>&1; then
  qrencode -t ANSIUTF8 "$payload"
else
  echo "qrencode missing, ASCII fallback:"
  printf '%s\\n' "$payload"
fi
`)
			}
		]
	};
	mainList.select(0);
}

function openBluetoothMenu() {
	mode = 'submenu';
	currentSubmenu = {
		title: 'Bluetooth actions',
		items: [
			{
				label: 'List devices',
				action: async () => {
					await updateBluetooth();
					mode = 'bluetooth-list';
					mainList.select(0);
				}
			},
			{
				label: 'Search new devices',
				action: () => withSuspendedUI('bluetoothctl --timeout 12 scan on')
			}
		]
	};
	mainList.select(0);
}

function openDisplayMenu() {
	mode = 'submenu';
	currentSubmenu = {
		title: 'Brightness actions',
		items: [
			{ label: 'Increase +5%', action: () => run('brightnessctl -e4 -n2 set 5%+') },
			{ label: 'Decrease -5%', action: () => run('brightnessctl -e4 -n2 set 5%-') }
		]
	};
	mainList.select(0);
}

function openAudioMenu() {
	mode = 'submenu';
	currentSubmenu = {
		title: 'Volume actions',
		items: [
			{ label: 'Increase +5%', action: () => run('wpctl set-volume -l 1 @DEFAULT_AUDIO_SINK@ 5%+') },
			{ label: 'Decrease -5%', action: () => run('wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%-') },
			{ label: 'Toggle mute', action: () => run('wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle') }
		]
	};
	mainList.select(0);
}

function isPrintable(str) {
	return typeof str === 'string' && str.length === 1 && str.charCodeAt(0) >= 32 && str.charCodeAt(0) !== 127;
}

screen.on('keypress', async (ch, key) => {
	if (isBusy) return;
	if (key.ctrl && key.name === 'c') process.exit(0);

	if (mode === 'home') {
		if (key.name === 'escape') process.exit(0);
		else if (key.name === 'left') homeItems[mainList.selected]?.onLeft?.();
		else if (key.name === 'right') homeItems[mainList.selected]?.onRight?.();
		else if (key.name === 'return' || key.name === 'space') {
			const onEnter = homeItems[mainList.selected]?.onEnter;
			if (onEnter) await onEnter();
			render();
		} else if (ch && isPrintable(ch) && key.name !== 'up' && key.name !== 'down' && key.name !== 'return' && key.name !== 'space') {
			mode = 'app-search';
			appSearchQuery = ch;
			mainList.select(0);
			render();
		}
	} else if (mode === 'submenu') {
		if (key.name === 'escape') {
			mode = 'home';
			mainList.select(0);
			render();
		} else if (key.name === 'return' || key.name === 'space') {
			const action = submenuItems[mainList.selected]?.action;
			if (action) await action();
			await refreshState();
			render();
		}
	} else if (mode === 'wifi-list') {
		if (key.name === 'escape') {
			mode = 'submenu';
			mainList.select(0);
			render();
		} else if ((key.name === 'return' || key.name === 'space') && state.wifiNetworks.length) {
			const network = state.wifiNetworks[mainList.selected];
			if (!/^[a-zA-Z0-9_]+$/.test(state.wifi.device || '')) {
				setMessage('Unsafe wifi station identifier', 'error');
				return;
			}
			if (!isSafeNetworkName(network.name)) {
				setMessage('Unsafe wifi network name', 'error');
				return;
			}
			isBusy = true;
			try {
				screen.leave();
				spawnSync('iwctl', ['station', state.wifi.device, 'connect', network.name], { stdio: 'inherit' });
				spawnSync('bash', ['-lc', 'echo; read -r -p "Press Enter to return..." _'], { stdio: 'inherit' });
			} finally {
				isBusy = false;
				screen.enter();
			}
			await refreshState();
			render();
		}
	} else if (mode === 'bluetooth-list') {
		if (key.name === 'escape') {
			mode = 'submenu';
			mainList.select(0);
			render();
		} else if ((key.name === 'return' || key.name === 'space') && state.bluetoothDevices.length) {
			const device = state.bluetoothDevices[mainList.selected];
			if (!isSafeMac(device.mac)) {
				setMessage('Unsafe bluetooth device identifier', 'error');
				return;
			}
			const connected = state.bluetooth.connectedMacs.has(device.mac);
			await runArgs('bluetoothctl', [connected ? 'disconnect' : 'connect', device.mac]);
			await refreshState();
			render();
		}
	} else if (mode === 'app-search') {
		if (key.name === 'escape') {
			mode = 'home';
			appSearchQuery = '';
			mainList.select(0);
			render();
		} else if (key.name === 'backspace') {
			appSearchQuery = appSearchQuery.slice(0, -1);
			mainList.select(0);
			if (!appSearchQuery) mode = 'home';
			render();
		} else if (key.name === 'return') {
			const apps = filteredApps();
			if (apps.length) {
				screen.leave();
				launchApp(apps[mainList.selected]);
			}
		} else if (ch && isPrintable(ch) && key.name !== 'up' && key.name !== 'down' && key.name !== 'return' && key.name !== 'space' && key.name !== 'escape' && key.name !== 'backspace') {
			appSearchQuery += ch;
			mainList.select(0);
			render();
		}
	}
});

mainList.focus();

loadApps();
render();
refreshState();

setInterval(() => {
	state.now = new Date();
	if (mode === 'home') render();
}, 1000);

setInterval(() => {
	refreshState().catch(() => setMessage('Refresh failed', 'error'));
}, 5000);
