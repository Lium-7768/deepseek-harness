# Agent Note: Client 面的项目引用

Status: implemented

[English](2026-08-30-client-face-project-references.md) | 中文

## Problem

`packages/client/web` 为其冻结的静态模块表引入六个 Host 包。每个 `./remote` 与 `./typert` 声明文件都会再导出 Host 类型，而 `tsconfig.base.json` 的 `paths` 把这些工作区名称解析到 `src`。缺少项目引用时，Client 程序会把那些 Host `src` 当作自己的输入来编译，而不是重定向到 Host 构建的声明输出，于是 Host 独有的全局对象进入了 Client 面：`node:buffer` 与 `node:module` 报 `TS2591`，`Symbol.dispose` 报 `TS2550`，`@deepseek-ai/dsh-session-projection/types` 的类型增强报 `TS2664`。

`injectWorkspacePackages: true` 掩盖了这一点。把每个工作区依赖物化成仅含 `lib` 的副本，会把 `src` 从解析图中移除，因此 Client 面从未看到 Host 源码 —— 但深层 `src` 导入也一并无法解析，而源码平面依赖它。

## Decision

`pnpm-workspace.yaml` 保留 `linkWorkspacePackages: true`，去掉 `injectWorkspacePackages: true`；工作区依赖重新成为符号链接，深层 `src` 导入通过各包的 `"./src/*"` 导出解析。`packages/client/web/tsconfig.json` 为其模块表点名的每个 Host 包声明项目引用，与 `packages/client/ui-goal` 引用 `packages/goal/goal` 的既有做法一致。

把工作区导入重定向到声明输出的正是项目引用。`paths` 本身只指出源码位置，因此两项设置必须一致：Client 程序引入的每个 Host 包都需要一条引用，添加模块表词条却不加引用会重现同一批 Host 全局对象的报错。

## Consequences

Client 面针对 Host 声明输出编译，Host 独有的全局对象不再进入其中；桌面端 Electron 闭包照常工作，因为其部署步骤本就以 `dereference: true` 复制工作区残留文件，并不依赖物化后的依赖。现在向 Web 静态模块表添加一个 Remote 契约需要三处协同修改 —— 包依赖、由 `satisfies Record<PlatformModule, unknown>` 强制配对的 `platform.ts` 词条与 `seed.ts` 条目，以及 `tsconfig.json` 中的引用。

在未构建 Host 面的工作树上单独运行 `tsc -b tsconfig.client.json` 会报出 Host 全局对象的错误。`pnpm run typecheck` 会先构建 Host 面；单独的 Client 构建不是有效信号。

## Alternatives considered

- 保留 `injectWorkspacePackages: true`：它会破坏源码平面依赖的每个深层 `src` 导入，且没有任何 Agent Note 或桌面端文档为该设置提供依据。
- 放宽 `tsconfig.base.client.json` 的 `lib` 或 `types` 以接受这些 Host 全局对象：这会让确实仅限 Host 的 API 编译进 Client 包，而这正是拆分编译面所要捕获的故障。
- 从模块表中移除这些 Host 导入：冻结的模块表正是打包后的桌面端解析 bundle 外部依赖的依据，缺少某个 Remote 契约会让它停在启动页。
