local config = require("vimwiki-render.config")

local M = {}

---Export PDF using tools/pdf.js
---@param target? string "book", "all", or path to note
function M.export(target)
	local cfg = config.get()
	local pdf_script = cfg.tools_dir .. "/pdf.js"

	if vim.fn.filereadable(pdf_script) == 0 then
		vim.notify("[vimwiki-render] PDF script not found at " .. pdf_script, vim.log.levels.ERROR)
		return
	end

	local arg = (target and target ~= "") and target or "book"
	local cmd = { cfg.node_bin, pdf_script, arg }

	if cfg.notify then
		vim.notify("[vimwiki-render] Generating PDF ('" .. arg .. "')...", vim.log.levels.INFO)
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
					vim.notify(
						"[vimwiki-render] PDF successfully generated in " .. cfg.pdf_dir .. "/",
						vim.log.levels.INFO
					)
				end
			else
				local err_msg = table.concat(stderr_chunks, "\n")
				vim.notify(
					"[vimwiki-render] PDF export failed (code " .. exit_code .. "):\n" .. err_msg,
					vim.log.levels.ERROR
				)
			end
		end,
	})
end

return M
