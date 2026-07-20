local micro = import("micro")
local shell = import("micro/shell")

local prettier_extensions = {
	js = true, jsx = true, mjs = true, cjs = true,
	ts = true, tsx = true, mts = true, cts = true,
	css = true, scss = true, less = true,
	html = true, vue = true,
	json = true, json5 = true,
	md = true, markdown = true,
	yaml = true, yml = true,
	graphql = true, gql = true
}

function onSave(bp)
	local path = bp.Buf.Path
	if not path then return end
	local ext = path:match("%.([^%.]+)$")
	if ext and prettier_extensions[ext:lower()] then
		local _, err = shell.RunCommand("prettier --write --log-level silent " .. path)
		if err == nil then bp.Buf:ReOpen() end
	end
end

function spawnKittyTab(bp)
	if not bp.Cursor:HasSelection() then return end
	local abs_path = bp.Buf.AbsPath
	local first_y = bp.Cursor.CurSelection[1].Y
	local second_y = bp.Cursor.CurSelection[2].Y
	local start_line = math.min(first_y, second_y) + 1
	local end_line = math.max(first_y, second_y) + 1
	shell.RunCommand(string.format("kitty @ launch --type=tab nono -f %s:%d-%d", abs_path, start_line, end_line))
end
