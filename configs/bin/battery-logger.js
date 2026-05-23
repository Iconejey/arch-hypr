#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, '..', '..', 'battery-log.json');
const capacity_path = '/sys/class/power_supply/BAT0/capacity';
const status_path = '/sys/class/power_supply/BAT0/status';

function updateLog() {
	let capacity, status;
	try {
		capacity = parseInt(fs.readFileSync(capacity_path, 'utf8').trim());
		status = fs.readFileSync(status_path, 'utf8').trim();
	} catch (e) {
		console.error('Could not read battery status', e);
		return;
	}

	const isCharging = status === 'Charging' || status === 'Full';
	const now = Date.now();
	const entry = { time: now, level: Math.min(100, Math.max(0, capacity)), charging: isCharging };

	let logs = [];
	if (fs.existsSync(logFile)) {
		try {
			logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
		} catch (e) {
			console.error('Could not parse battery log', e);
		}
	}

	// Don't append if the last entry was less than a minute ago
	if (logs.length > 0 && now - logs[logs.length - 1].time < 60 * 1000) {
		return;
	}

	logs.push(entry);
	const eightHoursAgo = now - 8 * 60 * 60 * 1000;
	logs = logs.filter(log => log.time >= eightHoursAgo);

	try {
		fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
	} catch (e) {
		console.error('Could not write battery log', e);
	}
}

updateLog();
setInterval(updateLog, 10 * 60 * 1000);
