# Agent Note: 移除桌面工作区中的旧移动端客户端

Status: implemented

[English](2026-08-22-remove-legacy-mobile-client.md) | 中文

## Problem

在独立版本管理的 `deepseek-harness-mobile` 仓库成为原生客户端唯一事实源后，桌面工作区仍在 `apps/mobile` 中保留完整的 Expo 和 React Native 客户端。这个重复工作区保留了原生构建元数据、移动端专用依赖，以及没有任何桌面或 Web 模块使用的共享展示包。

## Decision

桌面工作区不再包含原生客户端应用。独立的移动端仓库拥有 Expo 项目、iOS 与 Android 原生文件、移动端展示类型和移动端发布自动化。桌面工作区保留 `packages/mobile/gateway`，因为 `apps/desktop` 使用它为已配对原生设备提供认证配对、允许列表 HTTP 与 SSE 投影以及事件回放。

本次清理移除 `apps/mobile`、`packages/client/ui-shared`、移动端专用 pnpm 补丁和包扩展、相应锁文件记录，以及过期的生成目录与翻译清单引用。工作区源码路径别名覆盖既有 PowerShell、渲染器和设置客户端测试所使用的已导出 `src/*` 导入。

## Alternatives considered

**保留旧客户端作为工作区消费者。** 这会维持第二个原生构建入口，使旧 UI 与独立仓库发生漂移，并继续将 Expo 依赖耦合到桌面端的安装和发布工作。

**将 Mobile Gateway 移到独立移动端仓库。** Gateway 在桌面进程内运行，并在桌面 runtime 周围实施边界；将它放到客户端仓库会破坏其所有权和部署模型。

**保留共享展示包以备未来复用。** 客户端删除后，该包没有活跃消费者。继续保留会形成没有所有者或测试目标的不受支持工作区接口。

## Consequences

桌面端和 Web 开发不再安装、构建或测试原生 Expo 应用。原生客户端变更只在 `deepseek-harness-mobile` 中进行；影响移动端配对或同步的桌面端变更仍位于 `packages/mobile/gateway` 和 `apps/desktop`。

仓库保留描述旧客户端路径的历史 Agent Note，作为不可变记录。当前生成文档和活跃配置不再引用已删除的包。

## Verification

工作区锁文件在不包含已删除 Expo 与共享展示依赖的情况下完成解析。Mobile Gateway 包可在桌面工作区中构建，其集成测试可运行。仓库构建、生成配置目录、双语目录配对、包路径验证和文档门禁覆盖剩余的桌面端与 Gateway 表面。
