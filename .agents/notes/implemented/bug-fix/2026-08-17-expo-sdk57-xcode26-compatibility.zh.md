# Agent Note: Expo SDK 57 原生工具链兼容性

Status: implemented

[English](2026-08-17-expo-sdk57-xcode26-compatibility.md) | 中文

## 问题

Expo SDK 57 使用 React Native 0.86.2，并要求采用 SDK 支持的 `react-native-reanimated` patch 版本。Xcode 26.0.1 会在应用 target 编译前拒绝 `expo-modules-jsi` 57.0.4 中的 `weak let` 声明。

## 决策

移动工作区使用 Expo SDK 57 支持的 `react-native-reanimated` 4.5.1。`patches/expo-modules-jsi@57.0.4.patch` 通过 pnpm 的 `patchedDependencies` 机制修改不兼容的 Swift 声明。iOS 工程和 Pods 从依赖图生成；不将 `node_modules`、Pods 或产品 Swift 设置作为本地修复点。

## 考虑过的替代方案

**要求使用更新版本的 Xcode** 被拒绝，因为受控的包补丁能让 Xcode 26.0.1 编译支持的依赖图，并保留现有开发环境的可用性。

**直接修改 CocoaPods 输出或 `node_modules`** 被拒绝，因为重新生成会移除这些修改，无法提供可复现的原生构建。

**保留不受支持的 Reanimated patch** 被拒绝，因为 Expo resolver 负责选择与 SDK 兼容的依赖版本。

## 后果

工作区 lockfile 记录 Expo 支持的 Reanimated patch，pnpm 补丁记录 Swift 源码修改。生成的 iOS 文件始终可以由工作区依赖图重新生成。Xcode 26.0.1 使用经过补丁处理的依赖构建 Debug target。

## 验证

`expo install --check` 接受 Expo 依赖图。Pods 安装经过补丁处理的 `expo-modules-jsi` 依赖后，`xcodebuild` 可以为 iPhone 17 Pro 模拟器完成 Debug 构建。
