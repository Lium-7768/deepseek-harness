# Agent Note: Mobile gateway workspace build compatibility

Status: implemented

[English](2026-08-19-mobile-gateway-workspace-build-compatibility.md) | 中文

## Problem

主机工作区构建会包含 `packages/mobile/gateway`，其公开包入口和桌面运行时载荷均使用 `lib/index.mjs`。该包在当前 tsdown 默认设置下会生成 `.js` 产物。注入式工作区包布局只暴露构建后的包文件，不会暴露每个包的完整 `src` 目录，而主机和客户端测试会有意导入部分源码子路径。网关在 TypeScript 6 下生成声明文件时还需要与 rolldown-plugin-dts 兼容的 Babel Generator 版本。

## Decision

`packages/mobile/gateway/tsdown.config.ts` 显式将 ESM JavaScript 输出映射为 `.mjs`，使 JavaScript 和声明文件名与 `@deepseek-ai/dsh-mobile-gateway` 的包元数据及桌面运行时加载器保持一致。`tsconfig.base.json` 将主机和客户端测试使用的源码子路径映射到仓库源码目录，`tsconfig.client.json` 引用了 `packages/client/ui-shared`，共享包测试属于客户端构建面。`pnpm-workspace.yaml` 将 `@babel/generator` 7.29.8 限定为 React Native Worklets 扩展的依赖，并为 `rolldown-plugin-dts` 解析 `@babel/generator` 8.0.0-rc.6，以生成 TypeScript 6 声明输出。

## Alternatives considered

**将移动网关包元数据和桌面运行时改为 `.js`** 被拒绝，因为已打包的运行时和现有集成测试会有意加载 `lib/index.mjs`；改变公开入口会引入无必要的运行时迁移。

**保留全局 Babel Generator 覆盖** 被拒绝，因为它会强制声明生成器使用 React Native 专用版本，并在打印 TypeScript 6 AST 节点时失败。

**将源码子路径测试改为导入构建产物** 被拒绝，因为静态 TypeScript 检查必须通过仓库源码路径解析工作区代码，并且在没有预构建依赖产物时仍可运行。

## Consequences

移动网关在每次工作区构建中都会生成 `lib/index.mjs` 和 `lib/index.d.mts`。根类型检查、移动端 TypeScript 检查和网关集成测试共同验证该工作区配置。React Native Worklets 构建保留其所需的 Generator 依赖，而主机声明生成不再选用该版本。
