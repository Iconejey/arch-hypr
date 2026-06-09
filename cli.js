#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { exec, spawn, spawnSync } = require('child_process');

const COLORS = {
	reset: '\x1b[0m',
	fg: '\x1b[38;5;252m',
	dim: '\x1b[2m',
	primaryBg: '\x1b[48;5;28m',
	baseBg: '\x1b[48;5;238m',
	progressBg: '\x1b[48;5;236m',
	headerFg: '\x1b[38;5;119m',
	errorFg: '\x1b[38;5;203m'
};

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

function pad(str, width) {
	if (str.length >= width) return str.slice(0, width);
	return str + ' '.repeat(width - str.length);
}

function clearScreen() {
	process.stdout.write('\x1b[2J\x1b[H');
}

function setMessage(text, type = 'info') {
	message = text;
	messageType = type;
	render();
}

async function withSuspendedUI(command) {
	isBusy = true;
	try {
		if (process.stdin.isTTY) process.stdin.setRawMode(false);
		process.stdin.removeListener('keypress', onKeypress);
		clearScreen();
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
		setupInput();
		render();
	}
}

function progressLine(content, progress, selected) {
	const width = Math.max(20, (process.stdout.columns || 100) - 4);
	const body = pad(content, width);
	if (selected) return `${COLORS.primaryBg}${COLORS.fg}${body}${COLORS.reset}`;
	if (typeof progress !== 'number') return `${COLORS.baseBg}${COLORS.fg}${body}${COLORS.reset}`;

	const clamped = Math.max(0, Math.min(1, progress));
	const split = Math.round(width * clamped);
	const done = body.slice(0, split);
	const todo = body.slice(split);
	return `${COLORS.baseBg}${COLORS.fg}${done}${COLORS.progressBg}${COLORS.fg}${todo}${COLORS.reset}`;
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
			if (l.startsWith('Exec=')) execCmd = l.slice(5).replace(/%[a-zA-Z]+/g, '').trim();
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
	process.stdout.write(COLORS.reset);
	process.exit(0);
}

async function updateBattery() {
	const res = await run('acpi -b');
	if (!res.ok || !res.stdout) return;
	const match = res.stdout.match(/Battery \d+: ([a-zA-Z\s]+), (\d+)%(?:, ([\d:]+))?/);
	if (!match) return;
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

function renderHome() {
	const lines = [];
	const time = state.now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	const date = state.now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
	lines.push({
		label: `Clock & date  ${time}  ${date}`,
		progress: null,
		onEnter: openPowerMenu
	});
	lines.push({
		label: `Battery  ${state.battery.percent ?? '--'}%  ${state.battery.time}`,
		progress: typeof state.battery.percent === 'number' ? state.battery.percent / 100 : 0,
		onEnter: openBatteryMenu
	});
	lines.push({
		label: `Wifi  ${state.wifi.ssid}${state.wifi.stars ? `  ${state.wifi.stars}` : ''}`,
		progress: null,
		onEnter: openWifiMenu
	});
	lines.push({
		label: `Bluetooth  ${state.bluetooth.connectedNames.length ? state.bluetooth.connectedNames.join(', ') : 'No device'}`,
		progress: null,
		onEnter: openBluetoothMenu
	});
	lines.push({
		label: `Brightness  ${state.brightness.percent}%`,
		progress: state.brightness.percent / 100,
		onLeft: () => adjustBrightness(-1),
		onRight: () => adjustBrightness(1),
		onEnter: openDisplayMenu
	});
	lines.push({
		label: `Volume  ${state.volume.percent}%${state.volume.muted ? ' (muted)' : ''}`,
		progress: state.volume.percent / 100,
		onLeft: () => adjustVolume(-1),
		onRight: () => adjustVolume(1),
		onEnter: openAudioMenu
	});
	if (state.media.playing) {
		lines.push({
			label: `Media  ${state.media.title}${state.media.artist ? ` - ${state.media.artist}` : ''}`,
			progress: state.media.progress,
			onLeft: () => run('playerctl previous'),
			onRight: () => run('playerctl next'),
			onEnter: () => run('playerctl play-pause')
		});
	}

	const max = lines.length - 1;
	if (homeSelection > max) homeSelection = max;

	process.stdout.write(`${COLORS.headerFg}arch-hypr cli${COLORS.reset}\n`);
	process.stdout.write(`${COLORS.dim}↑↓ select · Enter/Space open · Type to search apps · Esc exit${COLORS.reset}\n\n`);
	lines.forEach((line, index) => {
		process.stdout.write(progressLine(line.label, line.progress, index === homeSelection) + '\n');
	});

	if (message) {
		const color = messageType === 'error' ? COLORS.errorFg : COLORS.dim;
		process.stdout.write(`\n${color}${message}${COLORS.reset}\n`);
	}
	return lines;
}

function renderSubmenu() {
	process.stdout.write(`${COLORS.headerFg}${currentSubmenu.title}${COLORS.reset}\n`);
	process.stdout.write(`${COLORS.dim}↑↓ select · Enter/Space run · Esc back${COLORS.reset}\n\n`);
	currentSubmenu.items.forEach((item, index) => {
		const prefix = index === submenuSelection ? '> ' : '  ';
		const color = index === submenuSelection ? COLORS.headerFg : COLORS.fg;
		process.stdout.write(`${color}${prefix}${item.label}${COLORS.reset}\n`);
	});
	if (message) {
		const color = messageType === 'error' ? COLORS.errorFg : COLORS.dim;
		process.stdout.write(`\n${color}${message}${COLORS.reset}\n`);
	}
}

function renderWifiList() {
	process.stdout.write(`${COLORS.headerFg}Wifi networks${COLORS.reset}\n`);
	process.stdout.write(`${COLORS.dim}↑↓ select · Enter connect · Esc back${COLORS.reset}\n\n`);
	if (!state.wifiNetworks.length) {
		process.stdout.write(`${COLORS.dim}No network found${COLORS.reset}\n`);
		return;
	}
	state.wifiNetworks.forEach((net, index) => {
		const prefix = index === submenuSelection ? '> ' : '  ';
		const color = index === submenuSelection ? COLORS.headerFg : COLORS.fg;
		process.stdout.write(`${color}${prefix}${net.name}  ${net.stars}${COLORS.reset}\n`);
	});
}

function renderBluetoothList() {
	process.stdout.write(`${COLORS.headerFg}Bluetooth devices${COLORS.reset}\n`);
	process.stdout.write(`${COLORS.dim}↑↓ select · Enter connect/disconnect · Esc back${COLORS.reset}\n\n`);
	if (!state.bluetoothDevices.length) {
		process.stdout.write(`${COLORS.dim}No Bluetooth devices found${COLORS.reset}\n`);
		return;
	}
	state.bluetoothDevices.forEach((device, index) => {
		const prefix = index === submenuSelection ? '> ' : '  ';
		const status = state.bluetooth.connectedMacs.has(device.mac) ? 'connected' : 'disconnected';
		const color = index === submenuSelection ? COLORS.headerFg : COLORS.fg;
		process.stdout.write(`${color}${prefix}${device.name} (${status})${COLORS.reset}\n`);
	});
}

function renderAppSearch() {
	const apps = filteredApps();
	if (appSearchSelection >= apps.length) appSearchSelection = Math.max(0, apps.length - 1);
	process.stdout.write(`${COLORS.headerFg}App search${COLORS.reset}\n`);
	process.stdout.write(`${COLORS.dim}Type to filter · ↑↓ select · Enter launch+close · Esc cancel${COLORS.reset}\n\n`);
	process.stdout.write(`${COLORS.fg}Query: ${appSearchQuery}${COLORS.reset}\n\n`);
	if (!apps.length) {
		process.stdout.write(`${COLORS.dim}No app found${COLORS.reset}\n`);
		return apps;
	}
	for (let i = 0; i < Math.min(12, apps.length); i++) {
		const app = apps[i];
		const prefix = i === appSearchSelection ? '> ' : '  ';
		const color = i === appSearchSelection ? COLORS.headerFg : COLORS.fg;
		process.stdout.write(`${color}${prefix}${app.name}${COLORS.reset}\n`);
	}
	return apps;
}

function render() {
	clearScreen();
	if (mode === 'home') renderHome();
	else if (mode === 'submenu') renderSubmenu();
	else if (mode === 'wifi-list') renderWifiList();
	else if (mode === 'bluetooth-list') renderBluetoothList();
	else if (mode === 'app-search') renderAppSearch();
}

function openPowerMenu() {
	mode = 'submenu';
	submenuSelection = 0;
	currentSubmenu = {
		title: 'Power actions',
		items: [
			{ label: 'Shut down', action: () => run('systemctl poweroff -i') },
			{ label: 'Sleep', action: () => run('systemctl suspend') },
			{ label: 'Restart', action: () => run('systemctl reboot') }
		]
	};
}

function openBatteryMenu() {
	mode = 'submenu';
	submenuSelection = 0;
	currentSubmenu = {
		title: 'Battery power profile',
		items: [
			{ label: 'Eco (power-saver)', action: () => run('powerprofilesctl set power-saver') },
			{ label: 'Auto (balanced)', action: () => run('powerprofilesctl set balanced') },
			{ label: 'Performance', action: () => run('powerprofilesctl set performance') }
		]
	};
}

function openWifiMenu() {
	mode = 'submenu';
	submenuSelection = 0;
	currentSubmenu = {
		title: 'Wifi actions',
		items: [
			{
				label: 'List networks',
				action: async () => {
					await updateWifiNetworks();
					mode = 'wifi-list';
					submenuSelection = 0;
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
payload="WIFI:T:WPA;S:${network};P:${psk};;"
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
}

function openBluetoothMenu() {
	mode = 'submenu';
	submenuSelection = 0;
	currentSubmenu = {
		title: 'Bluetooth actions',
		items: [
			{
				label: 'List devices',
				action: async () => {
					await updateBluetooth();
					mode = 'bluetooth-list';
					submenuSelection = 0;
				}
			},
			{
				label: 'Search new devices',
				action: () => withSuspendedUI('bluetoothctl --timeout 12 scan on')
			}
		]
	};
}

function openDisplayMenu() {
	mode = 'submenu';
	submenuSelection = 0;
	currentSubmenu = {
		title: 'Brightness actions',
		items: [
			{ label: 'Increase +5%', action: () => run('brightnessctl -e4 -n2 set 5%+') },
			{ label: 'Decrease -5%', action: () => run('brightnessctl -e4 -n2 set 5%-') }
		]
	};
}

function openAudioMenu() {
	mode = 'submenu';
	submenuSelection = 0;
	currentSubmenu = {
		title: 'Volume actions',
		items: [
			{ label: 'Increase +5%', action: () => run('wpctl set-volume -l 1 @DEFAULT_AUDIO_SINK@ 5%+') },
			{ label: 'Decrease -5%', action: () => run('wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%-') },
			{ label: 'Toggle mute', action: () => run('wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle') }
		]
	};
}

async function handleHomeEnter(homeItems) {
	const item = homeItems[homeSelection];
	if (!item) return;
	if (item.onEnter) await item.onEnter();
}

function isPrintable(str) {
	return typeof str === 'string' && str.length === 1 && str.charCodeAt(0) >= 32 && str.charCodeAt(0) !== 127;
}

async function onKeypress(str, key) {
	if (isBusy) return;
	if (key.ctrl && key.name === 'c') process.exit(0);

	if (mode === 'home') {
		const items = renderHome();
		if (key.name === 'up') homeSelection = Math.max(0, homeSelection - 1);
		else if (key.name === 'down') homeSelection = Math.min(items.length - 1, homeSelection + 1);
		else if (key.name === 'left') items[homeSelection]?.onLeft?.();
		else if (key.name === 'right') items[homeSelection]?.onRight?.();
		else if (key.name === 'return' || str === ' ') await handleHomeEnter(items);
		else if (key.name === 'escape') process.exit(0);
		else if (isPrintable(str)) {
			mode = 'app-search';
			appSearchQuery = str;
			appSearchSelection = 0;
		}
		render();
		return;
	}

	if (mode === 'submenu') {
		if (key.name === 'up') submenuSelection = Math.max(0, submenuSelection - 1);
		else if (key.name === 'down') submenuSelection = Math.min(currentSubmenu.items.length - 1, submenuSelection + 1);
		else if (key.name === 'escape') mode = 'home';
		else if (key.name === 'return' || str === ' ') {
			const action = currentSubmenu.items[submenuSelection]?.action;
			if (action) await action();
			await refreshState();
		}
		render();
		return;
	}

	if (mode === 'wifi-list') {
		if (key.name === 'up') submenuSelection = Math.max(0, submenuSelection - 1);
		else if (key.name === 'down') submenuSelection = Math.min(state.wifiNetworks.length - 1, submenuSelection + 1);
		else if (key.name === 'escape') {
			mode = 'submenu';
			submenuSelection = 0;
		} else if ((key.name === 'return' || str === ' ') && state.wifiNetworks[submenuSelection]) {
			const network = state.wifiNetworks[submenuSelection];
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
				process.stdin.setRawMode(false);
				process.stdin.removeListener('keypress', onKeypress);
				clearScreen();
				spawnSync('iwctl', ['station', state.wifi.device, 'connect', network.name], { stdio: 'inherit' });
				spawnSync('bash', ['-lc', 'echo; read -r -p "Press Enter to return..." _'], { stdio: 'inherit' });
			} finally {
				isBusy = false;
				setupInput();
			}
			await refreshState();
		}
		render();
		return;
	}

	if (mode === 'bluetooth-list') {
		if (key.name === 'up') submenuSelection = Math.max(0, submenuSelection - 1);
		else if (key.name === 'down') submenuSelection = Math.min(state.bluetoothDevices.length - 1, submenuSelection + 1);
		else if (key.name === 'escape') {
			mode = 'submenu';
			submenuSelection = 0;
		} else if ((key.name === 'return' || str === ' ') && state.bluetoothDevices[submenuSelection]) {
			const device = state.bluetoothDevices[submenuSelection];
			if (!isSafeMac(device.mac)) {
				setMessage('Unsafe bluetooth device identifier', 'error');
				return;
			}
			const connected = state.bluetooth.connectedMacs.has(device.mac);
			await runArgs('bluetoothctl', [connected ? 'disconnect' : 'connect', device.mac]);
			await refreshState();
		}
		render();
		return;
	}

	if (mode === 'app-search') {
		const apps = filteredApps();
		if (key.name === 'escape') {
			mode = 'home';
			appSearchQuery = '';
			appSearchSelection = 0;
		} else if (key.name === 'backspace') {
			appSearchQuery = appSearchQuery.slice(0, -1);
			appSearchSelection = 0;
			if (!appSearchQuery) mode = 'home';
		} else if (key.name === 'up') {
			appSearchSelection = Math.max(0, appSearchSelection - 1);
		} else if (key.name === 'down') {
			appSearchSelection = Math.min(Math.max(0, apps.length - 1), appSearchSelection + 1);
		} else if (key.name === 'return') {
			launchApp(apps[appSearchSelection]);
		} else if (isPrintable(str)) {
			appSearchQuery += str;
			appSearchSelection = 0;
		}
		render();
	}
}

function setupInput() {
	if (!process.stdin.isTTY) {
		console.error('arch-hypr CLI requires an interactive TTY terminal.');
		process.exit(1);
	}
	readline.emitKeypressEvents(process.stdin);
	process.stdin.setRawMode(true);
	process.stdin.on('keypress', onKeypress);
}

process.on('exit', () => {
	process.stdout.write(COLORS.reset);
});

process.on('SIGINT', () => process.exit(0));
process.stdout.on('resize', render);

loadApps();
setupInput();
render();
refreshState();
setInterval(() => {
	state.now = new Date();
	if (mode === 'home') render();
}, 1000);
setInterval(() => {
	refreshState().catch(() => setMessage('Refresh failed', 'error'));
}, 5000);
