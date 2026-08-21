const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)
const blockedDesktopTrees = [
  path.resolve(__dirname, '../desktop/.runtime'),
  path.resolve(__dirname, '../desktop-runtime'),
]
const desktopBlocks = blockedDesktopTrees.map((directory) => {
  const escaped = directory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\\/]/g, '[\\\\/]')
  return new RegExp(`^${escaped}[\\\\/].*$`)
})
const existingBlockList = config.resolver.blockList

config.resolver.blockList = existingBlockList === undefined
  ? desktopBlocks
  : [...(Array.isArray(existingBlockList) ? existingBlockList : [existingBlockList]), ...desktopBlocks]

module.exports = config
