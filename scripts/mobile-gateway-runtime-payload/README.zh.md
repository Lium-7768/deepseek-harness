# 移动网关运行时载荷

[English](README.md) | 中文

此目录保留一个独立 ECMAScript 模块，它曾在 **2026-08-18** 的本地桌面应用验证中用于替换已经构建完成的 DeepSeek Harness 应用包内的移动网关载荷。该文件作为可审计的维护工件保留；它**不是**应用入口、开发服务器或移动网关的源码。

## 载荷包含的内容

`index.mjs` 是移动网关模块的打包快照。它导出 `DshLoopbackClient`、`DshLoopbackError`、`MobileDeviceRegistry` 和 `MobileGateway` 运行时符号。该快照仅用于受控恢复，或检查此前部署的桌面包。

> **不要将此快照复制到新构建的桌面应用中。** 它早于当前具备工作区感知能力的会话列表投影，因此不包含当前 React Native 抽屉所需的 `workspace.list` 集成。

| 范畴 | 维护位置 |
|---|---|
| 网关源码 | `packages/mobile/gateway/src/` |
| 网关包入口 | `packages/mobile/gateway/src/index.ts` |
| 可复现打包输出 | 运行构建命令后的 `packages/mobile/gateway/lib/index.mjs` |
| 历史运行时快照 | `scripts/mobile-gateway-runtime-payload/index.mjs` |

## 重新生成当前载荷

使用 Node.js 22 从规范 TypeScript 源码构建网关包。生成的 `lib/` 目录有意被忽略，因为它可以复现。

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
pnpm --filter @deepseek-ai/dsh-mobile-gateway bundle
```

当前运行时模块的位置为：

```text
packages/mobile/gateway/lib/index.mjs
```

仅在执行明确、受控的桌面恢复操作时，才将该新生成文件复制到桌面应用包中。先停止桌面应用，保留原始归档的备份，重新打包后验证配对、会话同步、工作区分组和消息交换。日常开发和发布仍必须使用常规桌面构建流程。

## 验证

在将重新生成的包视为可用之前，从仓库根目录运行网关集成测试：

```bash
node --test packages/mobile/gateway/tests/mobile-gateway.integration.mjs
```

该测试套件验证已配对设备的请求处理和标准化的桌面历史事件。UI 行为和工作区树展示仍由移动应用的类型检查和组件逻辑测试覆盖。
