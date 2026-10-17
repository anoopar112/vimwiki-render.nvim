local config = require("vimwiki-render.config")

local M = {}

local server_job = nil

---Start the Vimwiki live development server
function M.start()
	local cfg = config.get()
	local server_script = cfg.tools_dir .. "/server.js"

	if vim.fn.filereadable(server_script) == 0 then
		vim.notify("[vimwiki-render] Server script not found at " .. server_script, vim.log.levels.ERROR)
		return
	end

	if server_job then
		vim.notify(
			"[vimwiki-render] Live server is already running (Job ID "
				.. server_job
				.. ") at http://localhost:"
				.. cfg.server.port,
			vim.log.levels.WARN
		)
		return
	end

	local cmd = { cfg.node_bin, server_script }
	if cfg.server.open_browser then
		table.insert(cmd, "--open")
	end

	server_job = vim.fn.jobstart(cmd, {
		cwd = cfg.wiki_path,
		env = {
			VIMWIKI_DIR = cfg.wiki_path,
		},
		detach = true,
		on_exit = function()
			server_job = nil
		end,
	})

	vim.notify(
		"[vimwiki-render] Live development server started at http://localhost:" .. cfg.server.port,
		vim.log.levels.INFO
	)
end

---Stop the Vimwiki live development server
function M.stop()
	local stopped = false

	if server_job then
		pcall(function()
			vim.fn.jobstop(server_job)
		end)
		server_job = nil
		stopped = true
	end

	-- Also sweep any orphan tools/server.js processes
	local pkill_check = vim.fn.executable("pkill") == 1
	if pkill_check then
		vim.fn.jobstart({ "pkill", "-f", "tools/server.js" }, { detach = true })
	end

	if stopped then
		vim.notify("[vimwiki-render] Live development server stopped.", vim.log.levels.INFO)
	else
		vim.notify("[vimwiki-render] Server process cleanup triggered.", vim.log.levels.INFO)
	end
end

---Check live server and repository status
function M.status()
	local cfg = config.get()
	local running = server_job ~= nil

	local status_str = running
			and ("🟢 Running (Job ID " .. server_job .. ") on http://localhost:" .. cfg.server.port)
		or "⚪ Stopped"

	local notes_count = 0
	local html_count = 0

	if vim.fn.isdirectory(cfg.wiki_path) == 1 then
		local md_find = vim.fn.globpath(cfg.wiki_path, "**/*.md", false, true)
		notes_count = #md_find
	end

	if vim.fn.isdirectory(cfg.dist_dir) == 1 then
		local html_find = vim.fn.globpath(cfg.dist_dir, "**/*.html", false, true)
		html_count = #html_find
	end

	local lines = {
		"========================================",
		" 📓 Vimwiki Render Plugin Status",
		"========================================",
		" Wiki Root:     " .. cfg.wiki_path,
		" Dev Server:    " .. status_str,
		" Auto-Compile:  " .. (cfg.auto_compile and "Enabled (mode: " .. cfg.compile_mode .. ")" or "Disabled"),
		" Markdown Notes: " .. notes_count,
		" Compiled HTML:  " .. html_count .. " pages in dist/",
		"========================================",
	}

	vim.notify(table.concat(lines, "\n"), vim.log.levels.INFO)
end

---Return whether server is currently running
---@return boolean
function M.is_running()
	return server_job ~= nil
end

return M
