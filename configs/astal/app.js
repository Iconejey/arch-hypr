import { App, Astal, Gtk, Gdk } from 'astal/gtk3';
import { Variable, execAsync } from 'astal';
import { Window, CenterBox, Box, Label } from 'astal/gtk3/widget';

const time = Variable('').poll(1000, "date '+%H:%M:%S'");

function Bar(monitor) {
	return new Window({
		monitor,
		className: 'Bar',
		name: 'Overview',
		namespace: 'overview_bar',
		layer: Astal.Layer.OVERLAY,
		margin: 0,
		exclusivity: Astal.Exclusivity.EXCLUSIVE,
		anchor: Astal.WindowAnchor.TOP | Astal.WindowAnchor.LEFT | Astal.WindowAnchor.RIGHT,
		child: new CenterBox({
			className: 'bar',
			startWidget: new Box({
				children: [new Label({ className: 'workspaces', label: 'Workspaces here' })]
			}),
			centerWidget: new Box({
				children: [new Label({ className: 'clock', label: time() })]
			}),
			endWidget: new Box({
				halign: Gtk.Align.END,
				children: [new Label({ className: 'system', label: 'System Tray here' })]
			})
		})
	});
}

let isMenu = false;
let activeWindows = [];

App.start({
	css: 'style.css',
	instanceName: 'astal',
	requestHandler(request, res) {
		if (request === 'toggle') {
			isMenu = !isMenu;

			// Toggle bar visibility
			activeWindows.forEach(w => {
				if (isMenu) {
					w.show_all();
					w.visible = true;
				} else {
					w.hide();
				}
			});

			// Scale down workspace using hyprctl gaps
			if (isMenu) {
				execAsync('hyprctl keyword general:gaps_out 60').catch(print);
				execAsync('hyprctl keyword general:gaps_in 15').catch(print);
				execAsync('hyprctl keyword decoration:rounding 20').catch(print);
			} else {
				execAsync('hyprctl keyword general:gaps_out 20').catch(print);
				execAsync('hyprctl keyword general:gaps_in 5').catch(print);
				execAsync('hyprctl keyword decoration:rounding 10').catch(print); // Default rounding? Make sure to match default
			}

			return res('ok');
		}
		res('unknown');
	},
	main() {
		activeWindows = App.get_monitors().map(Bar);
	}
});
