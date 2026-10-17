local M = {}

---@class VimwikiRenderConfig
---@field wiki_path? string Path to the Vimwiki root directory. Defaults to vim.g.vimwiki_list[1].path or ~/Documents/vimwiki
---@field tools_dir? string Path to the tools directory containing build.js, server.js, etc. Defaults to <wiki_path>/tools
---@field dist_dir? string Path to compiled HTML output directory. Defaults to <wiki_path>/dist
---@field pdf_dir? string Path to compiled PDF output directory. Defaults to <wiki_path>/pdf
---@field node_bin? string Path or binary name for Node.js runtime. Defaults to "node"
---@field auto_compile? boolean Whether to automatically build HTML on buffer write (:w). Defaults to true
---@field compile_mode? "all"|"current" Whether auto_compile builds all pages or just the saved file. Defaults to "all"
---@field debounce_ms? number Delay in ms to debounce auto-compile requests. Defaults to 250
---@field notify? boolean Show vim.notify desktop notifications. Defaults to true
---@field open_command? string|nil Custom command to open files in browser. Defaults to nil (auto-detect)
---@field server? { port: number, auto_open: boolean } Live development server settings
---@field set_composite_filetype? boolean Set 'tasks.vimwiki.markdown' composite filetype for render-markdown.nvim. Defaults to true
---@field mappings? { enable: boolean, build?: string, open?: string, serve?: string, stop?: string, pdf?: string, sync?: string, status?: string } Keymaps configuration

M.defaults = {
	wiki_path = "~/Documents/vimwiki",
	tools_dir = nil, -- derived from wiki_path/tools if nil
	dist_dir = nil,  -- derived from wiki_path/dist if nil
	pdf_dir = nil,   -- derived from wiki_path/pdf if nil
	node_bin = "node",
	auto_compile = true,
	compile_mode = "all",
	debounce_ms = 250,
	notify = true,
	open_command = nil,
	server = {
		port = 3000,
		auto_open = true,
	},
	set_composite_filetype = true,
	mappings = {
		enable = false,
		build = "<leader>wb",
		open = "<leader>wo",
		serve = "<leader>ws",
		stop = "<leader>wx",
		pdf = "<leader>wp",
		sync = "<leader>wi",
		status = "<leader>w?",
	},
}

M.options = {}

---Resolve path with tilde expansion and trailing slash normalization
---@param p string
---@return string
local function normalize_path(p)
	local expanded = vim.fn.expand(p)
	if vim.fs and vim.fs.normalize then
		expanded = vim.fs.normalize(expanded)
	end
	return (expanded:gsub("/+$", ""))
end

---Setup and validate configuration options
---@param user_opts? VimwikiRenderConfig
---@return VimwikiRenderConfig
function M.setup(user_opts)
	M.options = vim.tbl_deep_extend("force", {}, M.defaults, user_opts or {})

	-- Auto-detect wiki_path from vim.g.vimwiki_list if user didn't specify one
	if not user_opts or not user_opts.wiki_path then
		if vim.g.vimwiki_list and type(vim.g.vimwiki_list) == "table" and vim.g.vimwiki_list[1] then
			local vw_path = vim.g.vimwiki_list[1].path
			if vw_path and type(vw_path) == "string" and vw_path ~= "" then
				M.options.wiki_path = vw_path
			end
		end
	end

	local plugin_root = vim.fn.fnamemodify(debug.getinfo(1, "S").source:sub(2), ":p:h:h:h")
	local internal_tools = plugin_root .. "/tools"

	M.options.wiki_path = normalize_path(M.options.wiki_path)
	if M.options.tools_dir then
		M.options.tools_dir = normalize_path(M.options.tools_dir)
	elseif vim.fn.isdirectory(internal_tools) == 1 then
		M.options.tools_dir = normalize_path(internal_tools)
	else
		M.options.tools_dir = normalize_path(M.options.wiki_path .. "/tools")
	end
	M.options.dist_dir = M.options.dist_dir and normalize_path(M.options.dist_dir) or (M.options.wiki_path .. "/dist")
	M.options.pdf_dir = M.options.pdf_dir and normalize_path(M.options.pdf_dir) or (M.options.wiki_path .. "/pdf")

	return M.options
end

---Get current options, initializing with defaults if setup hasn't run yet
---@return VimwikiRenderConfig
function M.get()
	if vim.tbl_isempty(M.options) then
		return M.setup({})
	end
	return M.options
end

return M
