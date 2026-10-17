local config = require("vimwiki-render.config")

local M = {}

---Open target path or URL in the default browser across platforms
---@param target string File path or URL
local function open_in_system_browser(target)
	local cfg = config.get()

	-- Custom user-specified opener
	if cfg.open_command and cfg.open_command ~= "" then
		vim.fn.jobstart({ cfg.open_command, target }, { detach = true })
		return
	end

	-- Builtin Neovim 0.10+ opener
	if vim.ui and vim.ui.open then
		local ok = pcall(vim.ui.open, target)
		if ok then
			return
		end
	end

	-- Platform fallbacks
	local os_name = vim.loop.os_uname().sysname
	local cmd
	if os_name == "Darwin" then
		cmd = { "open", target }
	elseif os_name == "Windows_NT" then
		cmd = { "cmd.exe", "/c", "start", "", target }
	else
		cmd = { "xdg-open", target }
	end

	vim.fn.jobstart(cmd, { detach = true })
end

---Open current note or wiki home in browser
---@param custom_file? string Optional explicit target file
function M.open(custom_file)
	local cfg = config.get()
	local wiki_dir = cfg.wiki_path
	local dist_dir = cfg.dist_dir

	local file_to_check = custom_file
	if not file_to_check or file_to_check == "" then
		file_to_check = vim.fn.expand("%:p")
	else
		file_to_check = vim.fn.fnamemodify(file_to_check, ":p")
	end

	if file_to_check and file_to_check ~= "" and file_to_check:find(wiki_dir, 1, true) then
		local rel = file_to_check:sub(#wiki_dir + 2):gsub("%.md$", ".html")
		local html_path = dist_dir .. "/" .. rel
		if vim.fn.filereadable(html_path) == 1 then
			open_in_system_browser(html_path)
			return
		end
	end

	-- Fallback to main index.html in dist
	local index_html = dist_dir .. "/index.html"
	if vim.fn.filereadable(index_html) == 1 then
		open_in_system_browser(index_html)
	else
		vim.notify(
			"[vimwiki-render] Compiled wiki index not found at "
				.. index_html
				.. ". Run :WikiBuild first.",
			vim.log.levels.WARN
		)
	end
end

return M
