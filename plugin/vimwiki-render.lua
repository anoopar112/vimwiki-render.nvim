if vim.g.loaded_vimwiki_render then
	return
end
vim.g.loaded_vimwiki_render = 1

local vr = require("vimwiki-render")

-- Command: :WikiBuild [all|<filepath>]
vim.api.nvim_create_user_command("WikiBuild", function(opts)
	local target = opts.args ~= "" and opts.args or "all"
	vr.build(target)
end, {
	nargs = "?",
	complete = "file",
	desc = "Build Vimwiki static HTML site or single note",
})

-- Command: :WikiOpen [filepath]
vim.api.nvim_create_user_command("WikiOpen", function(opts)
	local target = opts.args ~= "" and opts.args or nil
	vr.open(target)
end, {
	nargs = "?",
	complete = "file",
	desc = "Open rendered Vimwiki HTML note or home page in browser",
})

-- Command: :WikiServe
vim.api.nvim_create_user_command("WikiServe", function()
	vr.serve()
end, {
	desc = "Start Vimwiki live development server with auto-reload",
})

-- Command: :WikiStop
vim.api.nvim_create_user_command("WikiStop", function()
	vr.stop()
end, {
	desc = "Stop Vimwiki live development server",
})

-- Command: :WikiStatus
vim.api.nvim_create_user_command("WikiStatus", function()
	vr.status()
end, {
	desc = "Show Vimwiki rendering and server status",
})

-- Command: :WikiPdf [book|all|<filepath>]
vim.api.nvim_create_user_command("WikiPdf", function(opts)
	local target = opts.args ~= "" and opts.args or "book"
	vr.pdf(target)
end, {
	nargs = "?",
	complete = function()
		return { "book", "all" }
	end,
	desc = "Export Vimwiki notes to PDF (book, all, or specific file)",
})

-- Command: :WikiIndex / :WikiSync
vim.api.nvim_create_user_command("WikiIndex", function()
	vr.sync()
end, {
	desc = "Synchronize all folder index.md files with existing notes",
})

vim.api.nvim_create_user_command("WikiSync", function()
	vr.sync()
end, {
	desc = "Alias for :WikiIndex",
})
