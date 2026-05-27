const { exec } = require('child_process');

// Visibility Tracking to save battery
let isPanelVisible = true;
try {
	const STATE_FILE = '/tmp/arch-hypr-panel-state';
	if (fs.existsSync(STATE_FILE)) {
		isPanelVisible = fs.readFileSync(STATE_FILE, 'utf8').trim() === 'visible';
	}

	fs.watchFile(STATE_FILE, { interval: 100 }, () => {
		try {
			isPanelVisible = fs.readFileSync(STATE_FILE, 'utf8').trim() === 'visible';
			if (isPanelVisible) {
				// Instantly update everything when panel slides in!
				if (typeof updateBatteryDetails === 'function') updateBatteryDetails();
				if (typeof updateWifiStatus === 'function') updateWifiStatus();
				if (typeof updateBluetoothStatus === 'function') updateBluetoothStatus();
				if (typeof updateBrightnessUI === 'function') updateBrightnessUI();
				if (typeof updateVolumeUI === 'function') updateVolumeUI();
			}
		} catch (e) {}
	});
} catch (e) {}

// Utils
function $(selector) {
	return document.querySelector(selector);
}

function $$(selector) {
	return document.querySelectorAll(selector);
}

// Multi-toggle
for (const toggle of $$('.multi-toggle')) {
	const buttons = toggle.querySelectorAll('button');

	for (const button of buttons) {
		button.addEventListener('click', () => {
			for (const btn of buttons) btn.classList.toggle('active', btn === button);
		});
	}
}

// Sliders
for (const slider of $$('.slider')) {
	// Initialize the background gradient based on the starting value
	slider.style.setProperty('--val', `${slider.value}%`);

	// Update gradient on drag
	slider.onclick = e => {
		e.target.style.setProperty('--val', `${e.target.value}%`);

		// Optional: Update the text next to the slider for the mockup
		const value_text = e.target.parentElement.querySelector('span.label');
		if (value_text) value_text.textContent = `${e.target.value}%`;
	};
}

// Management toggle
let toggled_class = null;

for (const button of $$('.management-toggle')) {
	button.onclick = () => {
		const target_class = button.dataset.target;

		// Un-dim all
		for (const dimmed of $$('.dim')) dimmed.classList.remove('dim');

		// Hide all dedicated lines
		for (const dedicated of $$('.line.dedicated')) dedicated.classList.add('hidden');

		// Hide all menu-only labels
		for (const menu_only of $$('.menu-only')) menu_only.classList.add('hidden');

		// If already toggled, just reset
		if (target_class === toggled_class) {
			toggled_class = null;
			return;
		}

		// Set toggled class
		toggled_class = target_class;

		for (const line of $$('.line')) {
			// Dim non-target lines
			if (!line.classList.contains(target_class)) {
				line.classList.add('dim');
			}

			// If target line
			else {
				// If dedicated, show it
				if (line.classList.contains('dedicated')) line.classList.remove('hidden');

				// Show menu-only labels
				for (const menu_only of line.querySelectorAll('.menu-only')) menu_only.classList.remove('hidden');

				// Dim non-target groups in target line
				for (const group of line.querySelectorAll('.group')) {
					if (!group.classList.contains(target_class)) group.classList.add('dim');
				}
			}
		}
	};
}

// Battery graph
const fs = require('fs');
const path = require('path');

const render_battery_graph = () => {
	let battery_levels = [];
	try {
		const logFile = path.join(__dirname, '..', 'battery-log.json');
		battery_levels = JSON.parse(fs.readFileSync(logFile, 'utf8'));
	} catch (e) {
		console.error('Could not load battery stats', e);
	}

	const container = $('#battery-graph');
	if (!container) return;

	if (battery_levels.length < 2) {
		container.innerHTML = '<span class="small center-text" style="opacity: 0.5;">Not enough data yet</span>';
		return;
	}

	const width = 300;
	const height = 60;

	const min_time = battery_levels[0].time;
	const max_time = battery_levels[battery_levels.length - 1].time;

	let svg = `<svg id="battery-svg" style="flex: 1; min-height: 0; min-width: 0;" width="100%" viewBox="-5 -5 ${width + 10} ${height + 10}" preserveAspectRatio="none">`;

	// Draw horizontal guidelines for 0, 25, 50, 75, 100%
	for (let i = 0; i <= 100; i += 25) {
		const y = height - (i / 100) * height;
		svg += `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#c6c6c6" stroke-opacity="0.2" stroke-width="1" stroke-dasharray="3 2" />`;
	}

	for (let i = 0; i < battery_levels.length - 1; i++) {
		const p1 = battery_levels[i];
		const p2 = battery_levels[i + 1];

		const x1 = ((p1.time - min_time) / (max_time - min_time)) * width;
		const y1 = height - (p1.level / 100) * height;

		const x2 = ((p2.time - min_time) / (max_time - min_time)) * width;
		const y2 = height - (p2.level / 100) * height;

		// Color logic: green (#c3e88d) when charging, blue (#82aaff) when not
		const color = p2.charging ? '#c3e88d' : '#82aaff';
		const dash = p2.time - p1.time > 11 * 60 * 1000 ? 'stroke-dasharray="4"' : '';

		svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="4" stroke-linecap="round" ${dash} />`;
	}

	svg += `<circle id="hover-circle" r="4" fill="white" style="opacity: 0; pointer-events: none;" />`;
	svg += `</svg>`;
	container.innerHTML = svg + '<span class="small center-text" id="hover-info" style="pointer-events: none;"></span>';

	const svg_el = $('#battery-svg');
	const hover_circle = $('#hover-circle');
	const hover_info = $('#hover-info');
	const battery_line = $('#battery-graph-line');

	if (svg_el && hover_circle && hover_info && battery_line) {
		svg_el.onmousemove = e => {
			const rect = svg_el.getBoundingClientRect();
			const x_ratio = (e.clientX - rect.left) / rect.width;
			const view_box_x = x_ratio * (width + 10) - 5;
			const time_hovered = min_time + (view_box_x / width) * (max_time - min_time);

			let nearest = battery_levels[0];
			let min_diff = Infinity;
			for (const p of battery_levels) {
				const diff = Math.abs(p.time - time_hovered);
				if (diff < min_diff) {
					min_diff = diff;
					nearest = p;
				}
			}

			const x = ((nearest.time - min_time) / (max_time - min_time)) * width;
			const y = height - (nearest.level / 100) * height;

			hover_circle.setAttribute('cx', x);
			hover_circle.setAttribute('cy', y);
			hover_circle.style.opacity = '1';

			const d = new Date(nearest.time);
			const time_str = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');

			hover_info.textContent = `${time_str} - ${nearest.level}%`;
			battery_line.classList.add('hovered');
		};

		svg_el.onmouseleave = () => {
			hover_circle.style.opacity = '0';
			battery_line.classList.remove('hovered');
		};
	}
};

render_battery_graph();

// Wifi tabs behavior
const wifi_views = $('#wifi-views');
const wifi_views_container = $('#wifi-views-container');
const wifi_tab_buttons = $$('#wifi-tabs button');

const update_wifi_view_height = () => {
	// Determine the height of the currently visible view
	const active_index = Array.from(wifi_tab_buttons).findIndex(b => b.classList.contains('active'));
	if (active_index !== -1 && wifi_views) {
		const active_view = wifi_views.children[active_index];
		wifi_views_container.style.height = active_view.offsetHeight + 'px';

		// Update view opacity logic
		Array.from(wifi_views.children).forEach((view, i) => {
			view.classList.toggle('inactive-view', i !== active_index);
		});
	}
};

for (const button of wifi_tab_buttons) {
	button.onclick = () => {
		const index = button.dataset.view;
		wifi_views.style.transform = `translateX(calc(-${index} * (var(--bar-width) + 16px)))`;
		setTimeout(update_wifi_view_height, 50); // Slight delay to ensure content is measured

		// If scanner logic is defined, trigger it based on the scan view index (1)
		toggleScanner?.(index === '1');

		if (typeof toggleShareQR !== 'undefined') {
			toggleShareQR(index === '2');
		}
	};
}

// Initial height setup
update_wifi_view_height();

// Generate QR Code dynamically
const toggleShareQR = active => {
	if (!active) return;

	// Get active wifi device
	exec('iwctl station list', (err, stdout) => {
		if (err || !stdout) return;
		const pureList = stdout.replace(/\x1b\[[0-9;]*m/g, '');
		const listMatch = pureList.match(/^\s*([a-zA-Z0-9_]+)\s+connected/m);
		if (!listMatch) return;

		const device = listMatch[1];

		exec(`iwctl station ${device} show`, (err2, stdout2) => {
			if (err2 || !stdout2) return;
			const pure = stdout2.replace(/\x1b\[[0-9;]*m/g, '');
			const match = pure.match(/Connected network\s+(.*)/);
			if (!match) return;

			const ssid = match[1].trim();

			exec(`pkexec cat "/var/lib/iwd/${ssid}.psk"`, (err3, stdout3) => {
				if (err3 || !stdout3) return;

				const passMatch = stdout3.match(/Passphrase=(.*)/);
				if (!passMatch) return;

				const password = passMatch[1].trim();

				// Clear previous QR code if any
				$('.wifi-qr-code').innerHTML = '';

				const span = document.querySelector('#wifi-share span');
				if (span) span.textContent = password;

				new QRCode($('.wifi-qr-code'), {
					text: `WIFI:T:WPA;S:${ssid};P:${password};;`,
					width: 512,
					height: 512,
					colorDark: '#191919',
					colorLight: '#c6c6c6',
					correctLevel: QRCode.CorrectLevel.M
				});

				// Recalculate height so QR doesn't get clipped
				setTimeout(update_wifi_view_height, 50);
			});
		});
	});
};

// Toggle album view
const album_toggle = $('.toggle-album');
const media_container = $('#media');
album_toggle.onclick = () => media_container.classList.toggle('album');

// Media integration with playerctl
const media_title = $('#media .media-info .bold');
const media_artist = $('#media .media-info .small');
const media_art = $('#media .album-art img');
const btn_prev = $('#media .media-buttons button:nth-child(1)');
const btn_play = $('#media .media-buttons button:nth-child(2)');
const btn_next = $('#media .media-buttons button:nth-child(3)');
const btn_play_icon = btn_play.querySelector('i');
const media_slider = $('#media-slider');

media_art.onload = () => {
	if (media_art.naturalWidth && media_art.naturalHeight) {
		const ratio = media_art.naturalWidth / media_art.naturalHeight;
		media_container.style.setProperty('--art-ratio', ratio);
	}
};

btn_prev.onclick = () => exec('playerctl previous');
btn_play.onclick = () => exec('playerctl play-pause');
btn_next.onclick = () => exec('playerctl next');

let isDraggingMedia = false;

if (media_slider) {
	media_slider.addEventListener('mousedown', () => (isDraggingMedia = true));
	media_slider.addEventListener('mouseup', () => (isDraggingMedia = false));
	media_slider.addEventListener('touchstart', () => (isDraggingMedia = true));
	media_slider.addEventListener('touchend', () => (isDraggingMedia = false));

	media_slider.addEventListener('change', () => {
		// playerctl position takes seconds
		exec(`playerctl metadata mpris:length`, (err, stdout) => {
			if (!err && stdout.trim()) {
				const length = parseInt(stdout.trim()) / 1000000;
				const newPos = (media_slider.value / 100) * length;
				exec(`playerctl position ${newPos}`);
			}
		});
	});
}

function update_media() {
	exec('playerctl status', (err, stdout) => {
		const status = stdout.trim();
		if (err || status === 'Stopped' || status === '') {
			media_container.style.display = 'none';
		} else {
			media_container.style.display = '';
			btn_play_icon.innerText = status === 'Playing' ? 'pause' : 'play_arrow';

			exec("playerctl metadata --format '{{title}};;{{artist}};;{{mpris:artUrl}};;{{mpris:length}}'", (err, meta) => {
				if (!err && meta) {
					const parts = meta.trim().split(';;');
					const title = parts[0];
					const artist = parts[1];
					const artUrl = parts[2];
					const length = parts[3] ? parseInt(parts[3]) / 1000000 : 0;

					if (title) media_title.innerText = title;
					if (artist) media_artist.innerText = artist;
					if (artUrl) {
						let url = artUrl.replace('file://', '');
						if (media_art.src !== url && media_art.getAttribute('src') !== url) {
							media_art.src = url;
						}
					}

					if (length > 0 && !isDraggingMedia) {
						exec('playerctl position', (errPos, posOut) => {
							if (!errPos && posOut.trim()) {
								const pos = parseFloat(posOut.trim());
								const perc = (pos / length) * 100;
								if (media_slider) {
									media_slider.value = perc;
									media_slider.style.setProperty('--val', `${perc}%`);
								}
							}
						});
					}
				}
			});
		}
	});
}

setInterval(update_media, 1000);
update_media();

// App tabs behavior
const app_views = $('#app-views');
const app_views_container = $('#app-views-container');
const app_tab_buttons = $$('#app-tabs button');

const update_app_view_height = () => {
	// Determine the height of the currently visible view
	const active_index = Array.from(app_tab_buttons).findIndex(b => b.classList.contains('active'));
	if (active_index !== -1 && app_views) {
		const active_view = app_views.children[active_index];
		app_views_container.style.height = active_view.offsetHeight + 'px';

		// Update view opacity logic
		Array.from(app_views.children).forEach((view, i) => {
			view.classList.toggle('inactive-view', i !== active_index);
		});
	}
};

for (const button of app_tab_buttons) {
	button.onclick = () => {
		const index = button.dataset.view;
		app_views.style.transform = `translateX(calc(-${index} * (var(--bar-width) + 16px)))`;
		setTimeout(() => {
			update_app_view_height();
			// Wait for the animation to finish before focusing
			if (index === '1' && appSearchInput) {
				const onTransitionEnd = () => {
					appSearchInput.focus();
					app_views.removeEventListener('transitionend', onTransitionEnd);
				};
				app_views.addEventListener('transitionend', onTransitionEnd);
			}
		}, 20);
	};
}

// Initial height setup
update_app_view_height();

// Escape key to close menu or Space to open search
document.onkeydown = e => {
	if (e.key === 'Escape' && toggled_class) {
		for (const dimmed of $$('.dim')) dimmed.classList.remove('dim');
		for (const dedicated of $$('.line.dedicated')) dedicated.classList.add('hidden');
		for (const menu_only of $$('.menu-only')) menu_only.classList.add('hidden');
		toggled_class = null;
	} else if (e.key === ' ' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
		e.preventDefault();
		const appSearchBtn = document.querySelector('#app-tabs button[data-view="1"]');
		if (appSearchBtn && !appSearchBtn.classList.contains('active')) {
			appSearchBtn.click();
		} else if (appSearchBtn && appSearchBtn.classList.contains('active')) {
			const appSearchInput = document.querySelector('#app-search-input');
			if (appSearchInput) appSearchInput.focus();
		}
	}
};

// --- System Integration ---

// Power actions
$('#btn-shutdown').onclick = () => exec('systemctl poweroff -i');
$('#btn-sleep').onclick = () => exec('systemctl suspend');
$('#btn-restart').onclick = () => exec('systemctl reboot');

// Battery Status update
const updateBatteryDetails = () => {
	if (!isPanelVisible) return;
	exec('acpi -b', (err, stdout) => {
		if (err || !stdout) return;

		const match = stdout.match(/Battery 0: ([a-zA-Z\s]+), (\d+)%(?:, ([\d:]+))?/);
		if (!match) return;

		const batteryBtn = document.querySelector('button[data-target="battery-management"]');
		if (!batteryBtn) return;

		const spans = batteryBtn.querySelectorAll('span');
		const percentSpan = spans[0];
		const timeSpan = spans[1];
		const icon = batteryBtn.querySelector('i');

		const status = match[1].trim();
		const percent = parseInt(match[2]);
		// Ignore acpi's timeRaw, make our own estimation
		let customTimeEstimateStr = null;

		try {
			const logFile = path.join(__dirname, '..', 'battery-log.json');
			if (fs.existsSync(logFile)) {
				const logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
				if (logs.length >= 3) {
					const recent = logs.slice(-3);
					const p1 = recent[0];
					const p2 = recent[recent.length - 1];

					if (p1.charging === p2.charging && status === (p2.charging ? 'Charging' : 'Discharging')) {
						const deltaLvl = p2.level - p1.level;
						const deltaTimeMs = p2.time - p1.time;

						if (deltaTimeMs > 0 && deltaLvl !== 0) {
							let msRemaining = 0;
							if (!p2.charging && deltaLvl < 0) {
								const msPerPercent = deltaTimeMs / Math.abs(deltaLvl);
								msRemaining = msPerPercent * percent;
							} else if (p2.charging && deltaLvl > 0) {
								const msPerPercent = deltaTimeMs / deltaLvl;
								msRemaining = msPerPercent * (100 - percent);
							}

							if (msRemaining > 0) {
								const totalMinutes = Math.round(msRemaining / 60000);
								const hrs = Math.floor(totalMinutes / 60);
								const mins = totalMinutes % 60;
								customTimeEstimateStr = `${hrs} h ${mins.toString().padStart(2, '0')} min`;
							}
						}
					}
				}
			}
		} catch (e) {
			console.log('Error calculating custom battery estimate:', e);
		}

		if (percentSpan) percentSpan.textContent = `${percent}%`;

		if (customTimeEstimateStr) {
			if (timeSpan) {
				timeSpan.textContent = customTimeEstimateStr;
				timeSpan.style.display = '';
			}
		} else {
			if (timeSpan) timeSpan.style.display = 'none';
		}

		// Set the charging icon
		if (status === 'Charging') {
			icon.textContent = percent >= 50 ? 'battery_android_frame_bolt' : 'battery_android_bolt';
		} else {
			if (percent >= 98) icon.textContent = 'battery_android_frame_full';
			else if (percent >= 90) icon.textContent = 'battery_android_frame_6';
			else if (percent >= 75) icon.textContent = 'battery_android_frame_5';
			else if (percent >= 60) icon.textContent = 'battery_android_frame_4';
			else if (percent >= 45) icon.textContent = 'battery_android_frame_3';
			else if (percent >= 30) icon.textContent = 'battery_android_frame_2';
			else if (percent >= 15) icon.textContent = 'battery_android_frame_1';
			else icon.textContent = 'battery_android_alert';
		}
	});
};

updateBatteryDetails();
setInterval(updateBatteryDetails, 60000); // refresh every minute

// Power Profiles (Battery Modes)
const batModeContainer = document.querySelector('.battery-management.dedicated .multi-toggle');
if (batModeContainer) {
	const batModeBtns = batModeContainer.querySelectorAll('button');
	const profiles = ['power-saver', 'balanced', 'performance'];

	const updateBatteryModeSelection = () => {
		exec('powerprofilesctl get', (err, stdout) => {
			if (err || !stdout) return;
			const current = stdout.trim();
			const idx = profiles.indexOf(current);
			if (idx !== -1) {
				batModeBtns.forEach((btn, i) => {
					if (i === idx) btn.classList.add('active');
					else btn.classList.remove('active');
				});
			}
		});
	};

	updateBatteryModeSelection();

	batModeBtns.forEach((btn, i) => {
		btn.addEventListener('click', () => {
			exec(`powerprofilesctl set ${profiles[i]}`, () => {
				updateBatteryModeSelection();
			});
		});
	});
}

// Clock and Date update
const updateClock = () => {
	const powerBtn = document.querySelector('button[data-target="power-management"]');
	if (!powerBtn) return;

	const timeSpan = powerBtn.querySelector('span.bold');
	const dateSpan = powerBtn.querySelector('span.small');

	const now = new Date();
	if (timeSpan) {
		timeSpan.textContent = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
	}

	if (dateSpan) {
		const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		dateSpan.textContent = `${monthNames[now.getMonth()]} ${now.getDate()}`;
	}
};

updateClock();
setInterval(updateClock, 1000); // refresh every second for minimal delay when minute changes

// Wifi Status update
const updateWifiStatus = () => {
	if (!isPanelVisible) return;
	const wifiBtn = document.querySelector('button[data-target="wifi-management"]');
	if (!wifiBtn) return;

	const titleSpan = wifiBtn.querySelector('span');
	const icon = wifiBtn.querySelector('i');

	// Find the connected station
	exec('iwctl station list', (err, stdout) => {
		if (err || !stdout) return;

		const pureList = stdout.replace(/\x1b\[[0-9;]*m/g, '');
		const listMatch = pureList.match(/^\s*([a-zA-Z0-9_]+)\s+connected/m);

		if (!listMatch) {
			// Not connected
			wifiBtn.classList.remove('active');
			if (titleSpan) titleSpan.textContent = 'Disconnected';
			if (icon) icon.textContent = 'signal_wifi_off';
			wifiBtn.title = 'Wifi network (disconnected)';
			return;
		}

		const device = listMatch[1];

		// Get the connected SSID
		exec(`iwctl station ${device} show`, (err2, stdout2) => {
			if (err2 || !stdout2) return;

			const pure = stdout2.replace(/\x1b\[[0-9;]*m/g, '');
			const networkMatch = pure.match(/Connected network\s+(.*)/);
			const rssiMatch = pure.match(/RSSI\s+(-?\d+)\s+dBm/);

			if (networkMatch) {
				const ssid = networkMatch[1].trim();

				wifiBtn.classList.add('active');
				if (titleSpan) titleSpan.textContent = ssid;
				wifiBtn.title = `Wifi network (connected to ${ssid})`;

				// Optional: Set icon based on RSSI (signal strength)
				if (icon) {
					if (rssiMatch) {
						const rssi = parseInt(rssiMatch[1]);
						if (rssi > -60) icon.textContent = 'network_wifi';
						else if (rssi > -70) icon.textContent = 'network_wifi_3_bar';
						else if (rssi > -80) icon.textContent = 'network_wifi_2_bar';
						else icon.textContent = 'network_wifi_1_bar';
					} else {
						icon.textContent = 'network_wifi';
					}
				}
			} else {
				wifiBtn.classList.remove('active');
				if (titleSpan) titleSpan.textContent = 'Disconnected';
				if (icon) icon.textContent = 'signal_wifi_off';
				wifiBtn.title = 'Wifi network (disconnected)';
			}
		});
	});
};

updateWifiStatus();
setInterval(updateWifiStatus, 5000); // refresh every 5 seconds

// Wifi List update
const updateWifiList = () => {
	if (!isPanelVisible) return;
	const wifiListContainer = document.querySelector('#wifi-list .group');
	if (!wifiListContainer) return;

	exec('iwctl station list', (err, stdout) => {
		if (err || !stdout) return;
		const pure = stdout.replace(/\x1b\[[0-9;]*m/g, '');
		const match = pure.match(/^\s*([a-zA-Z0-9_]+)\s+(connected|disconnected|connecting)/m);
		if (!match) return;

		const device = match[1];

		exec(`iwctl station ${device} get-networks`, (err2, stdout2) => {
			if (err2 || !stdout2) return;
			const lines = stdout2.split('\n').map(l => l.replace(/\x1b\[[0-9;]*m/g, ''));
			const hl = lines.find(l => l.includes('Network name'));
			if (!hl) return;

			const ns = hl.indexOf('Network name');
			const ss = hl.indexOf('Security');
			const sigS = hl.indexOf('Signal');
			const hi = lines.indexOf(hl);

			let html = '';

			for (let i = hi + 2; i < lines.length; i++) {
				if (!lines[i].trim() || lines[i].includes('---')) continue;

				const name = lines[i].substring(ns, ss).trim();
				if (!name) continue;

				const connected = lines[i].substring(0, ns).includes('>');
				// If it's the currently connected network, don't show it in the list
				if (connected) continue;

				const sig = lines[i].substring(sigS).trim();

				let icon = 'network_wifi_1_bar';
				const asterisks = (sig.match(/\*/g) || []).length;
				if (asterisks === 4) icon = 'signal_wifi_4_bar';
				else if (asterisks === 3) icon = 'network_wifi_3_bar';
				else if (asterisks === 2) icon = 'network_wifi_2_bar';

				html += `
					<button title="${name}">
						<i>${icon}</i>
						<span>${name}</span>
					</button>
				`;
			}

			if (html) {
				wifiListContainer.innerHTML = html;

				// Handle connect clicks
				const buttons = wifiListContainer.querySelectorAll('button');
				buttons.forEach(btn => {
					btn.onclick = () => {
						const ssid = btn.title;
						// Just try to connect - standard iwctl implementation for known networks
						exec(`iwctl station ${device} connect "${ssid}"`, () => {
							updateWifiList();
							updateWifiStatus();
						});
					};
				});
			} else {
				wifiListContainer.innerHTML = `
					<div style="padding: 16px; text-align: center; opacity: 0.6; font-size: 0.9em;">
						No networks found
					</div>
				`;
			}
		});
	});
};

updateWifiList();
setInterval(updateWifiList, 15000); // refresh network list every 15 seconds

// Wifi QR Code Camera Scanner
const video = document.querySelector('#camera');
const canvas = document.querySelector('#camera-canvas');
let scannerInterval = null;
let streamState = null;

const toggleScanner = async active => {
	if (active) {
		try {
			streamState = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
			if (video) video.srcObject = streamState;

			// Start scanner loop
			scannerInterval = setInterval(scanFrame, 500); // 2fps is enough
		} catch (e) {
			console.error('Camera access denied or failed', e);
		}
	} else {
		if (scannerInterval) clearInterval(scannerInterval);
		if (streamState) streamState.getTracks().forEach(track => track.stop());
		if (video) video.srcObject = null;
	}
};

const scanFrame = () => {
	if (!video || !video.videoWidth || !canvas) return;

	canvas.width = video.videoWidth;
	canvas.height = video.videoHeight;
	const ctx = canvas.getContext('2d');
	ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

	const dataUrl = canvas.toDataURL('image/png');
	const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');

	const tmpPath = path.join(require('os').tmpdir(), 'hypr_panel_qr.png');
	fs.writeFileSync(tmpPath, base64Data, 'base64');

	exec(`zbarimg -q --raw ${tmpPath}`, (err, stdout) => {
		if (stdout && stdout.includes('WIFI:')) {
			// Found a code! Stop scanning to prevent spamming
			toggleScanner(false);

			// Switch UI back to List view
			const listBtn = document.querySelector('#wifi-tabs button[data-view="0"]');
			if (listBtn) listBtn.click();

			const qr = stdout.trim();
			const payload = qr.substring(qr.indexOf('WIFI:') + 5);
			const parts = payload.split(';');

			let ssid = '';
			let pass = '';

			parts.forEach(part => {
				if (part.startsWith('S:')) ssid = part.substring(2);
				if (part.startsWith('P:')) pass = part.substring(2);
			});

			if (ssid) {
				exec(`notify-send "WiFi Scanner" "Found network: ${ssid}"`);
				// Connect
				exec('iwctl station list', (e, out) => {
					if (e || !out) return;
					const match = out.replace(/\x1b\[[0-9;]*m/g, '').match(/^\s*([a-zA-Z0-9_]+)\s+(connected|disconnected|connecting)/m);
					if (match) {
						const device = match[1];
						const cmd = pass ? `iwctl --passphrase "${pass}" station ${device} connect "${ssid}"` : `iwctl station ${device} connect "${ssid}"`;

						exec(`notify-send "WiFi" "Connecting to ${ssid}..."`);
						exec(cmd, (errCmd, outCmd, stderrCmd) => {
							if (errCmd) {
								exec(`notify-send "WiFi Error" "${(stderrCmd || errCmd.message).replace(/"/g, "'")}"`);
							} else {
								exec(`notify-send "WiFi" "Connection command sent for ${ssid}"`);
							}

							// Spam updates to catch the exact moment it establishes
							updateWifiStatus();
							updateWifiList();
							setTimeout(() => {
								updateWifiStatus();
								updateWifiList();
							}, 3000);
							setTimeout(() => {
								updateWifiStatus();
								updateWifiList();
							}, 6000);
						});
					} else {
						exec(`notify-send "WiFi Scanner Error" "Could not find a valid wireless station device."`);
					}
				});
			} else {
				exec(`notify-send "WiFi Scanner Error" "Could not parse SSID."`);
			}
		}
	});
};

// Bluetooth Management
const updateBluetoothStatus = () => {
	if (!isPanelVisible) return;
	const btBtn = document.querySelector('.group.bluetooth-management button');
	if (!btBtn) return;

	const icon = btBtn.querySelector('i');
	const titleSpan = btBtn.querySelector('span');

	exec('bluetoothctl show', (err, stdout) => {
		if (err || !stdout) return;

		const poweredMatch = stdout.match(/Powered:\s+(yes|no)/);
		if (!poweredMatch || poweredMatch[1] === 'no') {
			btBtn.classList.remove('active');
			if (titleSpan) titleSpan.textContent = 'Disconnected';
			btBtn.title = 'Bluetooth (Powered Off)';
			return;
		}

		exec('bluetoothctl devices Connected', (err2, stdout2) => {
			if (err2 || !stdout2) return;

			const lines = stdout2.trim().split('\n');
			const pureLines = lines.map(l => l.replace(/\x1b\[[0-9;]*m/g, '').trim()).filter(l => l.startsWith('Device'));

			if (pureLines.length === 0) {
				btBtn.classList.add('active'); // It's powered on
				if (titleSpan) titleSpan.textContent = 'On';
				btBtn.title = 'Bluetooth (Powered On, No Devices Connected)';
			} else {
				const firstDeviceMatch = pureLines[0].match(/Device\s+([A-F0-9:]+)\s+(.*)/i);
				if (firstDeviceMatch) {
					const deviceName = firstDeviceMatch[2];
					btBtn.classList.add('active');
					if (titleSpan) titleSpan.textContent = deviceName;
					btBtn.title = `Bluetooth (Connected to ${deviceName})`;
				}
			}
		});
	});
};

const updateBluetoothList = () => {
	if (!isPanelVisible) return;
	const btListContainer = document.querySelector('#bluetooth-list .group');
	if (!btListContainer) return;

	exec('bluetoothctl devices', (err, stdout) => {
		if (err || !stdout) return;

		const lines = stdout.trim().split('\n');
		const pureLines = lines.map(l => l.replace(/\x1b\[[0-9;]*m/g, '').trim()).filter(l => l.startsWith('Device'));

		if (pureLines.length === 0) {
			btListContainer.innerHTML = `
				<div style="padding: 16px; text-align: center; opacity: 0.6; font-size: 0.9em;">
					No Bluetooth devices found
				</div>
			`;
			return;
		}

		let html = '';
		pureLines.forEach(line => {
			const match = line.match(/Device\s+([A-F0-9:]+)\s+(.*)/i);
			if (!match) return;

			const mac = match[1];
			const name = match[2];

			let icon = 'bluetooth';
			const lname = name.toLowerCase();
			if (lname.includes('airpods') || lname.includes('headphone') || lname.includes('bud') || lname.includes('audio') || lname.includes('bose') || lname.includes('sony')) icon = 'headphones';
			else if (lname.includes('mouse') || lname.includes('mx master')) icon = 'mouse';
			else if (lname.includes('keyboard') || lname.includes('keychron')) icon = 'keyboard';
			else if (lname.includes('phone') || lname.includes('galaxy') || lname.includes('iphone')) icon = 'smartphone';

			html += `
				<button title="${name}" data-mac="${mac}">
					<i>${icon}</i>
					<span>${name}</span>
				</button>
			`;
		});

		btListContainer.innerHTML = html;

		// Handle connect clicks
		const buttons = btListContainer.querySelectorAll('button');
		buttons.forEach(btn => {
			btn.onclick = () => {
				const mac = btn.dataset.mac;
				const name = btn.title;
				exec(`notify-send "Bluetooth" "Connecting to ${name}..."`);
				exec(`bluetoothctl connect ${mac}`, (errConnect, stdoutConnect) => {
					if (errConnect || stdoutConnect.includes('Failed')) {
						exec(`notify-send "Bluetooth" "Failed to connect to ${name}"`);
					} else {
						exec(`notify-send "Bluetooth" "Connected to ${name}"`);
					}
					updateBluetoothList();
					updateBluetoothStatus();
				});
			};
		});
	});
};

updateBluetoothStatus();
updateBluetoothList();
setInterval(updateBluetoothStatus, 5000);
setInterval(updateBluetoothList, 15000);

// Brightness controls
const brightnessSlider = $('#brightness-slider');
const brightnessLabel = $('#brightness-label');

if (brightnessSlider && brightnessLabel) {
	let isDraggingBrightness = false;

	function updateBrightnessUI() {
		if (!isPanelVisible) return;
		if (isDraggingBrightness) return;
		require('child_process').exec('brightnessctl i', (error, stdout) => {
			if (isDraggingBrightness) return;
			if (!error && stdout) {
				const match = stdout.match(/\((\d+)%\)/);
				if (match && match[1]) {
					const percentage = match[1];
					brightnessSlider.value = percentage;
					brightnessSlider.style.setProperty('--val', `${percentage}%`);
					brightnessLabel.textContent = `${percentage}%`;
				}
			}
		});
	}

	brightnessSlider.addEventListener('mousedown', () => (isDraggingBrightness = true));
	brightnessSlider.addEventListener('mouseup', () => (isDraggingBrightness = false));
	brightnessSlider.addEventListener('touchstart', () => (isDraggingBrightness = true));
	brightnessSlider.addEventListener('touchend', () => (isDraggingBrightness = false));

	brightnessSlider.addEventListener('input', e => {
		const value = e.target.value;
		brightnessLabel.textContent = `${value}%`;
		e.target.style.setProperty('--val', `${value}%`);
		require('child_process').exec(`brightnessctl s ${value}%`);
	});

	// initial and poll
	updateBrightnessUI();
	setInterval(updateBrightnessUI, 200);
}

// Volume controls
const volumeSlider = document.querySelector('.volume-slider');
const volumeLabel = document.querySelector('#volume-label');

if (volumeSlider && volumeLabel) {
	let isDraggingVolume = false;

	function updateVolumeUI() {
		if (!isPanelVisible) return;
		if (isDraggingVolume) return;
		require('child_process').exec('wpctl get-volume @DEFAULT_AUDIO_SINK@', (error, stdout) => {
			if (isDraggingVolume) return;
			if (!error && stdout) {
				const match = stdout.match(/Volume:\s+([0-9.]+)/);
				if (match && match[1]) {
					const percentage = Math.round(parseFloat(match[1]) * 100);
					volumeSlider.value = percentage;
					volumeSlider.style.setProperty('--val', `${percentage}%`);
					volumeLabel.textContent = `${percentage}%`;
				}
			}
		});
	}

	volumeSlider.addEventListener('mousedown', () => (isDraggingVolume = true));
	volumeSlider.addEventListener('mouseup', () => (isDraggingVolume = false));
	volumeSlider.addEventListener('touchstart', () => (isDraggingVolume = true));
	volumeSlider.addEventListener('touchend', () => (isDraggingVolume = false));

	volumeSlider.addEventListener('input', e => {
		const value = e.target.value;
		volumeLabel.textContent = `${value}%`;
		e.target.style.setProperty('--val', `${value}%`);
		require('child_process').exec(`wpctl set-volume -l 1.0 @DEFAULT_AUDIO_SINK@ ${value}%`);
	});

	// initial and poll
	updateVolumeUI();
	setInterval(updateVolumeUI, 200);
}

// --- App Search Integration ---
const appSearchInput = document.querySelector('#app-search-input');
const appListContainer = document.querySelector('#app-list-container');

if (appSearchInput && appListContainer) {
	let appsListCache = [];

	const parseDesktopFile = filePath => {
		try {
			const content = fs.readFileSync(filePath, 'utf8');
			const lines = content.split('\n');
			let isDesktopEntry = false;
			let name, execCmd, icon, noDisplay;

			for (const line of lines) {
				const trimmed = line.trim();
				if (trimmed.startsWith('[')) {
					isDesktopEntry = trimmed === '[Desktop Entry]';
					continue;
				}
				if (!isDesktopEntry || !trimmed.includes('=')) continue;

				const equalsIdx = trimmed.indexOf('=');
				const key = trimmed.substring(0, equalsIdx).trim();
				const val = trimmed.substring(equalsIdx + 1).trim();

				if (key === 'Name' && !name)
					name = val; // Only take first Name (prevent taking Name[fr] etc if loop doesn't handle locale, although usually locale is Name[locale]=)
				else if (key === 'Exec') {
					// Remove %u, %U, %f, %F placeholders
					execCmd = val.replace(/%[a-zA-Z]/g, '').trim();
				} else if (key === 'Icon') icon = val;
				else if (key === 'NoDisplay') noDisplay = val.toLowerCase() === 'true';
			}

			if (name && execCmd && !noDisplay) {
				return { name, exec: execCmd, icon };
			}
		} catch (e) {}
		return null;
	};

	const findIcon = iconName => {
		if (!iconName) return null; // no icon found
		if (iconName.startsWith('/')) return iconName; // Absolute path

		// Common GTK icon search paths
		const iconExts = ['.png', '.svg', '.xpm'];
		const searchPaths = [
			'/usr/share/icons/hicolor/128x128/apps/',
			'/usr/share/icons/hicolor/scalable/apps/',
			'/usr/share/icons/hicolor/64x64/apps/',
			'/usr/share/icons/hicolor/48x48/apps/',
			'/usr/share/icons/breeze/apps/48/',
			'/usr/share/icons/Adwaita/48x48/apps/',
			'/usr/share/pixmaps/',
			path.join(require('os').homedir(), '.local/share/icons/hicolor/128x128/apps/'),
			path.join(require('os').homedir(), '.local/share/icons/hicolor/scalable/apps/'),
			path.join(require('os').homedir(), '.local/share/icons/')
		];

		for (const dir of searchPaths) {
			try {
				if (!fs.existsSync(dir)) continue;
				for (const ext of iconExts) {
					const fullPath = path.join(dir, iconName + ext);
					if (fs.existsSync(fullPath)) return fullPath;
				}
			} catch (e) {}
		}

		return null;
	};

	const loadApps = () => {
		const appDirs = ['/usr/share/applications/', path.join(require('os').homedir(), '.local/share/applications/')];

		const apps = [];

		appDirs.forEach(dir => {
			if (!fs.existsSync(dir)) return;
			try {
				const files = fs.readdirSync(dir);
				for (const file of files) {
					if (file.endsWith('.desktop')) {
						const app = parseDesktopFile(path.join(dir, file));
						if (app && !apps.some(a => a.name === app.name)) {
							// For launching, it's safer to use gtk-launch if possible, or just the exec string
							app.desktopFile = file.replace('.desktop', '');
							apps.push(app);
						}
					}
				}
			} catch (e) {}
		});

		// Alphabetical sort
		apps.sort((a, b) => a.name.localeCompare(b.name));

		// Add absolute paths for icons
		apps.forEach(app => {
			app.iconPath = findIcon(app.icon);
		});

		return apps;
	};

	const renderApps = (query = '') => {
		let filteredApps = [];
		if (query) {
			const lowerQuery = query.toLowerCase();
			filteredApps = appsListCache.filter(app => app.name.toLowerCase().includes(lowerQuery));

			// Order "starts with" matches first
			filteredApps.sort((a, b) => {
				const aStarts = a.name.toLowerCase().startsWith(lowerQuery);
				const bStarts = b.name.toLowerCase().startsWith(lowerQuery);
				if (aStarts && !bStarts) return -1;
				if (!aStarts && bStarts) return 1;
				return a.name.localeCompare(b.name);
			});
		}

		let html = '';
		if (query && filteredApps.length > 0) {
			filteredApps.forEach((app, index) => {
				html += `
					<button class="${index === 0 ? 'focused' : ''}" title="${app.name}" data-exec="${app.exec}" data-desktop="${app.desktopFile}">
						${app.iconPath ? `<img src="${app.iconPath}" onerror="this.outerHTML='<i>apps</i>'" />` : `<i>apps</i>`}
						<span>${app.name}</span>
					</button>
				`;
			});
		}

		if (query && !html) {
			html = '<div style="padding: 16px; text-align: center; opacity: 0.6;">No apps found</div>';
		}

		appListContainer.innerHTML = html;
		appListContainer.parentElement.style.display = query ? '' : 'none';

		appListContainer.querySelectorAll('button').forEach(btn => {
			btn.onclick = () => {
				const execCmd = btn.dataset.exec;
				const desktopFile = btn.dataset.desktop;

				// Try gtk-launch first, fallback to direct exec
				exec(`gtk-launch \${desktopFile}`, err => {
					if (err) {
						exec(execCmd);
					}
				});

				appSearchInput.value = '';
				renderApps();
				// simulate escape to close the panel
				document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
			};
		});

		// Trigger container height update when the number of rendered items changes
		if (typeof update_app_view_height === 'function') {
			update_app_view_height();
		}
	};

	// Initialize on next tick so it doesn't block startup
	setTimeout(() => {
		appsListCache = loadApps();
		renderApps();
	}, 500);

	appSearchInput.addEventListener('input', e => {
		renderApps(e.target.value);
	});

	// Keyboard navigation support
	appSearchInput.addEventListener('keydown', e => {
		const focusedBtn = appListContainer.querySelector('button.focused');

		if (e.key === 'Enter') {
			e.preventDefault();
			if (focusedBtn) focusedBtn.click();
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (focusedBtn && focusedBtn.nextElementSibling && focusedBtn.nextElementSibling.tagName === 'BUTTON') {
				focusedBtn.classList.remove('focused');
				focusedBtn.nextElementSibling.classList.add('focused');
				focusedBtn.nextElementSibling.scrollIntoView({ block: 'nearest' });
			}
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			if (focusedBtn && focusedBtn.previousElementSibling && focusedBtn.previousElementSibling.tagName === 'BUTTON') {
				focusedBtn.classList.remove('focused');
				focusedBtn.previousElementSibling.classList.add('focused');
				focusedBtn.previousElementSibling.scrollIntoView({ block: 'nearest' });
			}
		}
	});

	// Refresh apps occasionally in case new ones are installed
	setInterval(() => {
		appsListCache = loadApps();
		renderApps(appSearchInput.value);
	}, 60000 * 5); // 5 mins
}
