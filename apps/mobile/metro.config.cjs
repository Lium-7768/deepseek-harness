const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)
const desktopRuntime = path.resolve(__dirname, '../desktop/.runtime')
const escapedRuntime = desktopRuntime.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\\/]/g, '[\\\\/]')
const runtimeBlock = new RegExp(`^${escapedRuntime}[\\\\/].*$`)
const existingBlockList = config.resolver.blockList

config.resolver.blockList = existingBlockList === undefined
  ? [runtimeBlock]
  : [...(Array.isArray(existingBlockList) ? existingBlockList : [existingBlockList]), runtimeBlock]

module.exports = config
