# @deepseek-ai/dsh-client-ui-shared

English | [中文](README.zh.md)

Shared presentation types, theme tokens, and pure event projection helpers used by the desktop Web client and the native mobile client. The package classifies user, assistant, and tool events, filters protocol and internal prompt traffic, joins assistant streaming chunks, derives compact tool state, and splits rendered text into prose and fenced-code segments.

## Model Experience

### Session event projection

#### What the model sees

`projectVisibleMessages()` does not reach a model request; it only projects records that the desktop runtime has already persisted.

#### Token effect

None; the projection neither adds to nor removes content from provider requests.

#### KV Cache effect

None; the package does not alter provider request order or cached prompt content.

## Known Limitations and Deferred Work

- **Event classification is intentionally projection-oriented** — it accepts known desktop event records rather than defining a public wire schema; new durable event families require an explicit visibility decision and tests before clients render them.
- **Message segmentation recognizes fenced code only** — Markdown layout, syntax highlighting, and rich attachments remain client-owned rendering concerns.
- **Theme tokens are a shared semantic baseline** — platform-specific accessibility, safe-area, typography, and elevation behavior stays with each client.
