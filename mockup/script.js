// Multi-toggle
for (const toggle of document.querySelectorAll('.multi-toggle')) {
	const buttons = toggle.querySelectorAll('button');

	for (const button of buttons) {
		button.addEventListener('click', () => {
			for (const btn of buttons) btn.classList.toggle('active', btn === button);
		});
	}
}

// Sliders
for (const slider of document.querySelectorAll('.slider')) {
	// Initialize the background gradient based on the starting value
	slider.style.setProperty('--val', `${slider.value}%`);

	// Update gradient on drag
	slider.addEventListener('input', e => {
		e.target.style.setProperty('--val', `${e.target.value}%`);

		// Optional: Update the text next to the slider for the mockup
		const value_text = e.target.parentElement.querySelector('span.label');
		if (value_text) value_text.textContent = `${e.target.value}%`;
	});
}

// Management toggle
let toggled_class = null;

for (const button of document.querySelectorAll('.management-toggle')) {
	button.addEventListener('click', () => {
		const target_class = button.dataset.target;

		// Un-dim all
		for (const dimmed of document.querySelectorAll('.dim')) dimmed.classList.remove('dim');

		// Hide all dedicated lines
		for (const dedicated of document.querySelectorAll('.line.dedicated')) dedicated.classList.add('hidden');

		// Hide all menu-only labels
		for (const menu_only of document.querySelectorAll('.menu-only')) menu_only.classList.add('hidden');

		// If already toggled, just reset
		if (target_class === toggled_class) {
			toggled_class = null;
			return;
		}

		// Set toggled class
		toggled_class = target_class;

		for (const line of document.querySelectorAll('.line')) {
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
	});
}

// Wifi tabs behavior
const wifi_views = document.getElementById('wifi-views');
const wifi_views_container = document.getElementById('wifi-views-container');
const wifi_tab_buttons = document.querySelectorAll('#wifi-tabs button');

const updateWifiViewHeight = () => {
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
	button.addEventListener('click', () => {
		const index = button.dataset.view;
		wifi_views.style.transform = `translateX(calc(-${index} * (var(--bar-width) + 16px)))`;
		setTimeout(updateWifiViewHeight, 50); // Slight delay to ensure content is measured
	});
}

// Ensure initial height is calculated after fonts/styles load
window.addEventListener('load', updateWifiViewHeight);

// Generate QR Code
new QRCode(document.querySelector('.wifi-qr-code'), {
	text: 'WIFI:T:WPA;S:Livebox-C940;P:hiEudZiR37d2nGdiz;;',
	width: 512,
	height: 512,
	colorDark: '#191919',
	colorLight: '#c6c6c6',
	correctLevel: QRCode.CorrectLevel.M
});
