# Agent Note: 规范化桌面端与 Mobile Gateway 发布成员

Status: implemented

[English](2026-08-22-normalize-desktop-and-gateway-release-members.md) | 中文

## Problem

工作区发布成员策略已将 `packages/*/*` 和 `apps/*` 视为可发布产物，但 Mobile Gateway 与桌面端清单仍保留启动阶段的私有元数据和不完整发布 payload。Gateway 还绕过了标准的声明优先构建和包自有 invariant companion。这些不一致使发布、invariant、许可证和已打包产物检查对于桌面交付表面得出相互冲突的结论。

## Decision

`@deepseek-ai/dsh-mobile-gateway`、`@deepseek-ai/dsh-desktop` 和 `@deepseek-ai/dsh-desktop-runtime` 都是发布成员，使用与根目录对齐的版本、公开 npm access 元数据、仓库目录和 MIT 许可证。桌面应用发布其 `out` bundle 以及物化的 `.runtime` 依赖闭包。仅依赖的桌面运行时发布其 manifest，部署流程从该 manifest 物化闭包。

Gateway 采用普通 DSH 包布局：TypeScript 生成 `lib/types`，tsdown 独立生成 `lib/index.js` 和 `lib/invariant.js` 入口，并由包同时导出和声明它们。其 companion 保留 Gateway 包名，并说明除集成测试已覆盖的传输行为外，不存在可被独立观测的 Cordis 事件或持久化数据关系。

本决策取代了[旧发布序列策略](../../archived/process/2026-08-13-public-vendor-and-native-sequences.md)中关于 dsh 家族 access 的断言。发布仍只通过现有的受审查发布路径发生；声明 access 元数据不会发布任何包。

## Alternatives considered

**保持这三个清单为私有。** 这会使工作区定义为发布成员的包无法通过打包和 invariant 验证，桌面交付树也继续缺少文档说明。

**将桌面应用和 Gateway 排除在发布成员检查之外。** 这会为部署中安装或物化的产物建立特殊且未验证的打包类别，削弱仓库的 manifest 和 payload 策略。

**在发布命令中使用 `--access` 标志。** 命令标志会覆盖随产物传递的 manifest，且无法在发布家族之间一致地表达包自有 access 决策。

## Consequences

未来的发布准备可将 Gateway、桌面应用和桌面运行时验证为完整的包 payload。后续发布标签可使用公开 access 发布这些成员；改变该 access 需要单独的发布策略决策。

旧 access 策略记录仍是分阶段发布模型的历史理由，但不再是 DSH 包 access 的当前描述。工作区约束、包清单和本说明是当前唯一事实源。

## Verification

工作区约束验证三个清单及其声明的 payload。包 invariant 检查验证 Gateway companion，Gateway 集成测试在标准构建生成发布入口后验证其认证传输行为。
