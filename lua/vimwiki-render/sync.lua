local config = require("vimwiki-render.config")

local M = {}

---Synchronize folder index.md files using tools/index-sync.js
function M.sync()
	local cfg = config.get()
	local sync_script = cfg.tools_dir .. "/index-sync.js"

	if vim.fn.filereadable(sync_script) == 0 then
		vim.notify("[vimwiki-render] Index sync script not found at " .. sync_script, vim.log.levels.ERROR)
		return
	end

	local cmd = { cfg.node_bin, sync_script }

	if cfg.notify then
		vim.notify("[vimwiki-render] Synchronizing folder indexes...", vim.log.levels.INFO)
	end

	local stderr_chunks = {}

	vim.fn.jobstart(cmd, {
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
			if exit_code == 0 then
				if cfg.notify then
					vim.notify("[vimwiki-render] Folder indexes synchronized successfully!", vim.log.levels.INFO)
				end
			else
				local err_msg = table.concat(stderr_chunks, "\n")
				vim.notify(
					"[vimwiki-render] Index sync failed (code " .. exit_code .. "):\n" .. err_msg,
					vim.log.levels.ERROR
				)
			end
		end,
	})
end

return M
