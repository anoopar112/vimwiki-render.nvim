local config = require("vimwiki-render.config")
local builder = require("vimwiki-render.builder")
local browser = require("vimwiki-render.browser")
local server = require("vimwiki-render.server")
local pdf = require("vimwiki-render.pdf")
local sync = require("vimwiki-render.sync")
local autocommands = require("vimwiki-render.autocommands")

local M = {}

---Public API methods
M.build = builder.build
M.open = browser.open
M.serve = server.start
M.stop = server.stop
M.status = server.status
M.pdf = pdf.export
M.sync = sync.sync

---Setup keymaps if enabled in configuration
---@param cfg VimwikiRenderConfig
local function setup_keymaps(cfg)
	if not cfg.mappings or not cfg.mappings.enable then
		return
	end

	local map = vim.keymap.set
	local maps = cfg.mappings

	if maps.build then
		map("n", maps.build, function()
			M.build("all")
		end, { desc = "Vimwiki: Build static site" })
	end

	if maps.open then
		map("n", maps.open, function()
			M.open()
		end, { desc = "Vimwiki: Open in browser" })
	end

	if maps.serve then
		map("n", maps.serve, function()
			M.serve()
		end, { desc = "Vimwiki: Start live server" })
	end

	if maps.stop then
		map("n", maps.stop, function()
			M.stop()
		end, { desc = "Vimwiki: Stop live server" })
	end

	if maps.pdf then
		map("n", maps.pdf, function()
			M.pdf("book")
		end, { desc = "Vimwiki: Export PDF book" })
	end

	if maps.sync then
		map("n", maps.sync, function()
			M.sync()
		end, { desc = "Vimwiki: Sync folder indexes" })
	end

	if maps.status then
		map("n", maps.status, function()
			M.status()
		end, { desc = "Vimwiki: Show render status" })
	end
end

---Initialize plugin with user options
---@param user_opts? VimwikiRenderConfig
function M.setup(user_opts)
	local cfg = config.setup(user_opts)
	autocommands.setup()
	setup_keymaps(cfg)
	return M
end

return M
