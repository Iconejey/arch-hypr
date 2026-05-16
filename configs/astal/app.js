import { App, Astal, Gtk, Gdk } from 'astal/gtk3';
import { Variable } from 'astal';
import { Window, CenterBox, Box, Label } from 'astal/gtk3/widget';

const time = Variable('').poll(1000, "date '+%H:%M:%S'");

function Bar(monitor) {
	return new Window({
		monitor,
		className: 'Bar',
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

App.start({
	css: 'style.css',
	main() {
		App.get_monitors().map(Bar);
	}
});
