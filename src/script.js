const { exec } = require('child_process');

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
	};
}

// Initial height setup
update_wifi_view_height();

// Generate QR Code
new QRCode($('.wifi-qr-code'), {
	text: 'WIFI:T:WPA;S:Livebox-C940;P:hiEudZiR37d2nGdiz;;',
	width: 512,
	height: 512,
	colorDark: '#191919',
	colorLight: '#c6c6c6',
	correctLevel: QRCode.CorrectLevel.M
});

// Toggle album view
const album_toggle = $('.toggle-album');
const media_container = $('#media');
album_toggle.onclick = () => media_container.classList.toggle('album');

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
		setTimeout(update_app_view_height, 50); // Slight delay to ensure content is measured
	};
}

// Initial height setup
update_app_view_height();

// Escape key to close menu
document.onkeydown = e => {
	if (e.key === 'Escape' && toggled_class) {
		for (const dimmed of $$('.dim')) dimmed.classList.remove('dim');
		for (const dedicated of $$('.line.dedicated')) dedicated.classList.add('hidden');
		for (const menu_only of $$('.menu-only')) menu_only.classList.add('hidden');
		toggled_class = null;
	}
};

// --- System Integration ---

// Power actions
$('#btn-shutdown').onclick = () => exec('systemctl poweroff -i');
$('#btn-sleep').onclick = () => exec('systemctl suspend');
$('#btn-restart').onclick = () => exec('systemctl reboot');

// Battery Status update
const updateBatteryDetails = () => {
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
		const timeRaw = match[3];

		if (percentSpan) percentSpan.textContent = `${percent}%`;

		if (timeRaw && status !== 'Unknown') {
			const parts = timeRaw.split(':');
			if (timeSpan) {
				timeSpan.textContent = `${parseInt(parts[0])} h ${parts[1]} min`;
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
