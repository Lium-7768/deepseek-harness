# Agent Note：Expo SDK 57 原生工具链兼容性

Status: implemented

[English](2026-08-17-expo-sdk57-xcode26-compatibility.md) | 中文

## 问题

移动端使用 Expo SDK 57 与 React Native 0.86.2，但 `react-native-reanimated` 的 patch 版本超出 SDK 支持范围。全新执行 Expo prebuild 和 CocoaPods 安装后，应用 target 尚未编译就失败，因为 Xcode 26.0.1 不接受 `expo-modules-jsi` 57.0.4 中的 `weak let` 声明。

## 决策

使用 Expo resolver 将 `react-native-reanimated` 对齐到 SDK 57 支持的 4.5.1，并根据结果依赖图重新生成 iOS 工程和 Pods。不修改 `node_modules`、Pods 或产品 Swift 设置。Expo 的 SDK 57 支持表要求 Xcode 26.4 或更新版本；剩余原生构建失败是环境前置条件不足，不是过期生成工程造成的。

## 后果

JavaScript 依赖清单和 workspace lockfile 记录了 Expo 支持的 Reanimated patch。生成的 iOS 工程仍是可丢弃的构建产物，依赖变更后必须重新生成。构建此应用前需要选择 Xcode 26.4 或更新版本，然后重新运行标准 Expo Debug 命令。

## 验证

`expo install --fix --pnpm` 将 Reanimated 从 4.5.3 改为 4.5.1 后，`expo install --check` 通过。全新执行 `expo prebuild --platform ios --no-install`、CocoaPods 安装以及 `expo run:ios --configuration Debug --device DC45FFE1-D3E5-4335-8BAD-EBD81A264035 --no-bundler` 时，在 Xcode 26.0.1 / Swift 6.2 下稳定复现 15 个 `weak let` 错误。Expo SDK 57 支持表列出 Xcode 26.4+；构建失败，因此不声称有源码补丁或截图验证。
