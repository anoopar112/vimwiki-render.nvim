local config = require("vimwiki-render.config")

local M = {}

local active_job = nil
local pending_build = nil
local debounce_timer = nil

---Notify with plugin prefix if notifications are enabled
---@param msg string
---@param level? integer
local function log_notify(msg, level)
	local cfg = config.get()
	if cfg.notify then
		vim.notify("[vimwiki-render] " .. msg, level or vim.log.levels.INFO)
	end
end

---Execute build job asynchronously
---@param target? string "all" or specific filepath
---@param is_auto? boolean
local function run_build_job(target, is_auto)
	local cfg = config.get()
	local build_script = cfg.tools_dir .. "/build.js"

	if vim.fn.filereadable(build_script) == 0 then
		vim.notify("[vimwiki-render] Build script not found at " .. build_script, vim.log.levels.ERROR)
		return
	end

	local cmd = { cfg.node_bin, build_script }
	if target and target ~= "all" and vim.fn.filereadable(target) == 1 then
		table.insert(cmd, target)
	end

	local stderr_chunks = {}

	active_job = vim.fn.jobstart(cmd, {
		cwd = cfg.wiki_path,
		env = {
			VIMWIKI_DIR = cfg.wiki_path,
		},
		detach = true,
		on_stderr = function(_, data)
			if data then
				for _, line in ipairs(data) do
					if line ~= "" then
						table.insert(stderr_chunks, line)
					end
				end
			end
		end,
		on_exit = function(_, exit_code)
			active_job = nil
			if exit_code == 0 then
				if not is_auto then
					log_notify("Static build completed successfully.", vim.log.levels.INFO)
				end
			else
				local err_msg = table.concat(stderr_chunks, "\n")
				vim.notify(
					"[vimwiki-render] Build failed (code " .. exit_code .. "):\n" .. err_msg,
					vim.log.levels.ERROR
				)
			end

			-- Run queued build if one was requested while active
			if pending_build then
				local next_target, next_is_auto = pending_build.target, pending_build.is_auto
				pending_build = nil
				run_build_job(next_target, next_is_auto)
			end
		end,
	})
end

---Run static build (all or specific file)
---@param target? string "all" or file path (nil defaults to "all")
function M.build(target)
	if active_job then
		pending_build = { target = target or "all", is_auto = false }
		log_notify("Build in progress; request queued.", vim.log.levels.INFO)
		return
	end
	run_build_job(target or "all", false)
end

---Trigger debounced auto-compile from BufWritePost
---@param filepath string
function M.auto_compile(filepath)
	local cfg = config.get()
	if not cfg.auto_compile then
		return
	end

	if debounce_timer then
		debounce_timer:stop()
		if not debounce_timer:is_closing() then
			debounce_timer:close()
		end
		debounce_timer = nil
	end

	local target = (cfg.compile_mode == "current") and filepath or "all"

	debounce_timer = vim.loop.new_timer()
	debounce_timer:start(
		cfg.debounce_ms,
		0,
		vim.schedule_wrap(function()
			if debounce_timer then
				debounce_timer:stop()
				if not debounce_timer:is_closing() then
					debounce_timer:close()
				end
				debounce_timer = nil
			end

			if active_job then
				pending_build = { target = target, is_auto = true }
			else
				run_build_job(target, true)
			end
		end)
	)
end

return M
