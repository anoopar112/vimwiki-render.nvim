local config = require("vimwiki-render.config")
local builder = require("vimwiki-render.builder")

local M = {}

---Setup autocommands for auto-compilation and filetype integration
function M.setup()
	local cfg = config.get()

	-- 1. Auto-compile on save
	if cfg.auto_compile then
		local compile_group = vim.api.nvim_create_augroup("VimwikiRenderAutoCompile", { clear = true })
		local pattern = cfg.wiki_path .. "/**/*.md"

		vim.api.nvim_create_autocmd("BufWritePost", {
			pattern = pattern,
			group = compile_group,
			desc = "Auto-compile Vimwiki notes on save",
			callback = function(event)
				builder.auto_compile(event.file)
			end,
		})
	end

	-- 2. Composite filetype for render-markdown.nvim & treesitter integration
	if cfg.set_composite_filetype then
		local ft_group = vim.api.nvim_create_augroup("VimwikiRenderCompositeFiletype", { clear = true })

		vim.api.nvim_create_autocmd("FileType", {
			pattern = "vimwiki",
			group = ft_group,
			desc = "Set composite filetype tasks.vimwiki.markdown for Vimwiki buffers",
			callback = function(event)
				vim.schedule(function()
					if not vim.api.nvim_buf_is_valid(event.buf) then
						return
					end
					local buf_name = vim.api.nvim_buf_get_name(event.buf)
					if buf_name:find(cfg.wiki_path, 1, true) and vim.bo[event.buf].filetype == "vimwiki" then
						vim.bo[event.buf].filetype = "tasks.vimwiki.markdown"
					end
				end)
			end,
		})
	end
end

return M
