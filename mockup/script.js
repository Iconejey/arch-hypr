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
		const value_text = e.target.parentElement.querySelector('span[class]');
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

				// Dim non-target groups in target line
				for (const group of line.querySelectorAll('.group')) {
					if (!group.classList.contains(target_class)) group.classList.add('dim');
				}
			}
		}
	});
}
