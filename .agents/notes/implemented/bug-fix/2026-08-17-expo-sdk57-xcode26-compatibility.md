# Agent Note: Expo SDK 57 native toolchain compatibility

Status: implemented

English | [中文](2026-08-17-expo-sdk57-xcode26-compatibility.zh.md)

## Problem

Expo SDK 57 uses React Native 0.86.2 and requires the SDK-supported `react-native-reanimated` patch. Xcode 26.0.1 rejects the `weak let` declarations in `expo-modules-jsi` 57.0.4 before the application target compiles.

## Decision

The mobile workspace uses `react-native-reanimated` 4.5.1, the Expo SDK 57-supported version. `patches/expo-modules-jsi@57.0.4.patch` changes the incompatible Swift declarations through pnpm's `patchedDependencies` mechanism. The iOS project and Pods are generated from the dependency graph; `node_modules`, Pods, and product Swift settings are not edited as local fixes.

## Alternatives considered

**Requiring a newer Xcode release** was rejected because the controlled package patch makes Xcode 26.0.1 compile the supported dependency graph and keeps the existing development environment usable.

**Editing CocoaPods output or `node_modules` directly** was rejected because regeneration removes those edits and cannot provide a reproducible native build.

**Keeping an unsupported Reanimated patch** was rejected because Expo's resolver owns the SDK-compatible dependency selection.

## Consequences

The workspace lockfile records the Expo-supported Reanimated patch and the pnpm patch records the Swift source modification. Generated iOS files remain reproducible from the workspace dependency graph. Xcode 26.0.1 builds the Debug target with the patched dependency.

## Verification

`expo install --check` accepts the Expo dependency graph. `xcodebuild` completes the Debug build for the iPhone 17 Pro simulator after Pods install the patched `expo-modules-jsi` dependency.
