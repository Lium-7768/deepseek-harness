# Agent Note: Expo SDK 57 native toolchain compatibility

Status: implemented

English | [中文](2026-08-17-expo-sdk57-xcode26-compatibility.zh.md)

## Problem

The mobile app used Expo SDK 57 with React Native 0.86.2 and an out-of-range `react-native-reanimated` patch. A clean Expo prebuild and CocoaPods install still failed before the application target compiled because Xcode 26.0.1 rejects the `weak let` declarations shipped by `expo-modules-jsi` 57.0.4.

## Decision

Use Expo's resolver to align `react-native-reanimated` with the SDK 57 supported version, 4.5.1, and regenerate the iOS project and Pods from the resulting dependency graph. Do not patch `node_modules`, Pods, or product Swift settings. Expo's SDK 57 support table requires Xcode 26.4 or newer; the remaining native build failure is therefore an environment prerequisite, not a stale generated project.

## Consequences

The JavaScript dependency manifest and workspace lockfile record the Expo-supported Reanimated patch. The generated iOS project remains disposable and must be regenerated after dependency changes. Building this app requires selecting Xcode 26.4 or newer before rerunning the standard Expo Debug command.

## Verification

`expo install --check` passes after `expo install --fix --pnpm` changes Reanimated from 4.5.3 to 4.5.1. A fresh `expo prebuild --platform ios --no-install`, CocoaPods installation, and `expo run:ios --configuration Debug --device DC45FFE1-D3E5-4335-8BAD-EBD81A264035 --no-bundler` reproduce the 15 `weak let` errors under Xcode 26.0.1 / Swift 6.2. Expo's SDK 57 support table lists Xcode 26.4+; no source patch or screenshot is claimed from the failed build.
