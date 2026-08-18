import { Circle, G, Line, Path, Polyline, Rect, Svg } from 'react-native-svg'

/** Outline icon names shared by native controls and tool presentation. */
export const nativeIconNames = [
  'admin-panel-settings',
  'agent-preset',
  'arrow-back',
  'arrow-forward',
  'attach-file',
  'build',
  'chat',
  'chat-bubble-outline',
  'check',
  'chevron',
  'chevron-down',
  'chevron-left',
  'chevron-right',
  'chevron-up',
  'close',
  'code',
  'connect',
  'content-copy',
  'copy',
  'create-new-folder',
  'data',
  'description',
  'edit',
  'error-outline',
  'expand-less',
  'expand-more',
  'folder',
  'folder-close',
  'folder-open',
  'globe',
  'home',
  'language',
  'link',
  'link-off',
  'menu',
  'note-add',
  'paperclip',
  'personalization',
  'refresh',
  'route',
  'search',
  'send',
  'settings',
  'smart-toy',
  'stop',
  'terminal',
  'tune',
  'warning',
  'warning-amber',
] as const

export type NativeIconName = (typeof nativeIconNames)[number]

type IconProps = { color: string; size: number }

/**
 * Renders a semantic outline icon using the same 24px viewBox conventions as
 * the Web primitive icons, without relying on platform font glyph metrics.
 * @param props - Icon name, color, and display size.
 * @returns The native SVG icon element.
 */
export function NativeIcon({
  name,
  color,
  size = 18,
}: {
  name: NativeIconName
  color: string
  size?: number
}): React.JSX.Element {
  return (
    <Svg accessibilityElementsHidden height={size} viewBox="0 0 24 24" width={size} fill="none">
      <IconShape name={name} color={color} size={size} />
    </Svg>
  )
}

function IconShape({ name, color }: IconProps & { name: NativeIconName }): React.JSX.Element {
  const stroke = { stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (name) {
    case 'menu':
      return (
        <>
          <Line {...stroke} x1="4" x2="20" y1="7" y2="7" />
          <Line {...stroke} x1="4" x2="20" y1="12" y2="12" />
          <Line {...stroke} x1="4" x2="20" y1="17" y2="17" />
        </>
      )
    case 'close':
      return (
        <>
          <Line {...stroke} x1="6" x2="18" y1="6" y2="18" />
          <Line {...stroke} x1="18" x2="6" y1="6" y2="18" />
        </>
      )
    case 'search':
      return (
        <>
          <Circle {...stroke} cx="10.5" cy="10.5" r="6.2" />
          <Line {...stroke} x1="15.2" x2="20" y1="15.2" y2="20" />
        </>
      )
    case 'refresh':
      return (
        <>
          <Path {...stroke} d="M20 11a8 8 0 0 0-14.9-3.9L3 9" />
          <Polyline {...stroke} points="3 4.5 3 9 7.5 9" />
          <Path {...stroke} d="M4 13a8 8 0 0 0 14.9 3.9L21 15" />
          <Polyline {...stroke} points="21 19.5 21 15 16.5 15" />
        </>
      )
    case 'check':
      return <Polyline {...stroke} points="5 12.5 10 17.2 19 7" />
    case 'chevron':
    case 'chevron-down':
    case 'expand-more':
      return <Polyline {...stroke} points="6 9 12 15 18 9" />
    case 'chevron-right':
      return <Polyline {...stroke} points="9 5 16 12 9 19" />
    case 'chevron-left':
      return <Polyline {...stroke} points="15 5 8 12 15 19" />
    case 'chevron-up':
      return <Polyline {...stroke} points="6 15 12 9 18 15" />
    case 'expand-less':
      return <Polyline {...stroke} points="6 15 12 9 18 15" />
    case 'arrow-back':
      return (
        <>
          <Line {...stroke} x1="19" x2="5" y1="12" y2="12" />
          <Polyline {...stroke} points="11 6 5 12 11 18" />
        </>
      )
    case 'arrow-forward':
      return (
        <>
          <Line {...stroke} x1="5" x2="19" y1="12" y2="12" />
          <Polyline {...stroke} points="13 6 19 12 13 18" />
        </>
      )
    case 'home':
      return (
        <>
          <Polyline {...stroke} points="3.5 11.5 12 4.5 20.5 11.5" />
          <Path {...stroke} d="M5.5 10.5V20h13v-9.5M9.5 20v-5h5v5" />
        </>
      )
    case 'folder':
    case 'folder-close':
      return <Path {...stroke} d="M3.5 7.5h6l2 2h9v8.2a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2z" />
    case 'folder-open':
      return <Path {...stroke} d="M3.5 7.5h6l2 2h9l-1.7 8.2a2 2 0 0 1-2 1.6H5.2a2 2 0 0 1-2-2z" />
    case 'create-new-folder':
      return (
        <>
          <Path {...stroke} d="M3.5 7.5h6l2 2h8.5v8.2a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2z" />
          <Line {...stroke} x1="15.5" x2="15.5" y1="12" y2="17" />
          <Line {...stroke} x1="13" x2="18" y1="14.5" y2="14.5" />
        </>
      )
    case 'tune':
    case 'personalization':
      return (
        <>
          <Line {...stroke} x1="4" x2="20" y1="6" y2="6" />
          <Line {...stroke} x1="4" x2="20" y1="12" y2="12" />
          <Line {...stroke} x1="4" x2="20" y1="18" y2="18" />
          <Circle fill={color} cx="9" cy="6" r="1.8" />
          <Circle fill={color} cx="15" cy="12" r="1.8" />
          <Circle fill={color} cx="11" cy="18" r="1.8" />
        </>
      )
    case 'data':
      return (
        <Path
          {...stroke}
          d="M5 5.5c0-1.4 3.1-2.5 7-2.5s7 1.1 7 2.5v6c0 1.4-3.1 2.5-7 2.5s-7-1.1-7-2.5zM5 5.5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5M5 11.5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"
        />
      )
    case 'agent-preset':
      return (
        <>
          <Circle {...stroke} cx="12" cy="5" r="2" />
          <Circle {...stroke} cx="6.5" cy="17" r="2" />
          <Circle {...stroke} cx="17.5" cy="17" r="2" />
          <Line {...stroke} x1="10.9" x2="7.6" y1="6.7" y2="15.3" />
          <Line {...stroke} x1="13.1" x2="16.4" y1="6.7" y2="15.3" />
          <Line {...stroke} x1="8.5" x2="15.5" y1="17" y2="17" />
        </>
      )
    case 'chat':
    case 'chat-bubble-outline':
      return <Path {...stroke} d="M4 5.5h16v11H9l-5 3v-14z" />
    case 'route':
      return (
        <>
          <Circle {...stroke} cx="7" cy="6" r="2" />
          <Circle {...stroke} cx="17" cy="18" r="2" />
          <Path {...stroke} d="M7 8v3c0 2 2 3 4 3h2c2 0 4 1 4 3v-1" />
        </>
      )
    case 'description':
      return <Path {...stroke} d="M6 3.5h8l4 4V20H6zM14 3.5V8h4M9 12h6M9 16h6" />
    case 'attach-file':
    case 'paperclip':
      return (
        <G scale={1.5}>
          <Path
            fill={color}
            d="M5.5498 9.75V5H6.9502V9.75C6.9502 10.3299 7.4201 10.7998 8 10.7998C8.5799 10.7998 9.0498 10.3299 9.0498 9.75V4.5C9.0498 2.9536 7.7964 1.7002 6.25 1.7002C4.7036 1.7002 3.4502 2.9536 3.4502 4.5V9.75C3.4502 12.2629 5.4871 14.2998 8 14.2998C10.5129 14.2998 12.5498 12.2629 12.5498 9.75V4H13.9502V9.75C13.9502 13.0361 11.2861 15.7002 8 15.7002C4.71391 15.7002 2.0498 13.0361 2.0498 9.75V4.5C2.04981 2.1804 3.9304 0.299806 6.25 0.299805C8.5696 0.299805 10.4502 2.1804 10.4502 4.5V9.75C10.4502 11.1031 9.3531 12.2002 8 12.2002C6.6469 12.2002 5.5498 11.1031 5.5498 9.75Z"
          />
        </G>
      )
    case 'send':
      return (
        <G scale={1.5}>
          <Path
            fill={color}
            d="M8.3125 0.981587C8.66767 1.0545 8.97902 1.20558 9.2627 1.43374C9.48724 1.61438 9.73029 1.85933 9.97949 2.10854L14.707 6.83608L13.293 8.25014L9 3.95717V15.0431H7V3.95717L2.70703 8.25014L1.29297 6.83608L6.02051 2.10854C6.26971 1.85933 6.51277 1.61438 6.7373 1.43374C6.97662 1.24126 7.28445 1.04542 7.6875 0.981587C7.8973 0.94841 8.1031 0.956564 8.3125 0.981587Z"
          />
        </G>
      )
    case 'stop':
      return (
        <G scale={1.5}>
          <Path
            fill={color}
            d="M2 4.88C2 3.68009 2 3.08013 2.30557 2.65954C2.40426 2.52371 2.52371 2.40426 2.65954 2.30557C3.08013 2 3.68009 2 4.88 2H11.12C12.3199 2 12.9199 2 13.3405 2.30557C13.4763 2.40426 13.5957 2.52371 13.6944 2.65954C14 3.08013 14 3.68009 14 4.88V11.12C14 12.3199 14 12.9199 13.6944 13.3405C13.5957 13.4763 13.4763 13.5957 13.3405 13.6944C12.9199 14 12.3199 14 11.12 14H4.88C3.68009 14 3.08013 14 2.65954 13.6944C2.52371 13.5957 2.40426 13.4763 2.30557 13.3405C2 12.9199 2 12.3199 2 11.12V4.88Z"
          />
        </G>
      )
    case 'content-copy':
    case 'copy':
      return (
        <>
          <Rect {...stroke} height="11" rx="1.5" width="10" x="8.5" y="8.5" />
          <Path {...stroke} d="M6 15H5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 5 3h9A1.5 1.5 0 0 1 15.5 4.5v1" />
        </>
      )
    case 'link':
      return (
        <>
          <Path {...stroke} d="M9.5 14.5l5-5" />
          <Path {...stroke} d="M7.5 17.5l-1 1a3 3 0 0 1-4-4l3-3a3 3 0 0 1 4-0.2" />
          <Path {...stroke} d="M16.5 6.5l1-1a3 3 0 0 1 4 4l-3 3a3 3 0 0 1-4 .2" />
        </>
      )
    case 'link-off':
      return (
        <>
          <Path {...stroke} d="M9.5 14.5l5-5" />
          <Path {...stroke} d="M7.5 17.5l-1 1a3 3 0 0 1-4-4l2-2" />
          <Path {...stroke} d="M16.5 6.5l1-1a3 3 0 0 1 4 4l-2 2" />
          <Line {...stroke} x1="4" x2="20" y1="4" y2="20" />
        </>
      )
    case 'error-outline':
      return (
        <>
          <Circle {...stroke} cx="12" cy="12" r="8.5" />
          <Line {...stroke} x1="12" x2="12" y1="8" y2="13" />
          <Circle fill={color} cx="12" cy="16.5" r="1" />
        </>
      )
    case 'warning':
    case 'warning-amber':
      return (
        <>
          <Path {...stroke} d="M12 4l9 16H3z" />
          <Line {...stroke} x1="12" x2="12" y1="9" y2="14" />
          <Circle fill={color} cx="12" cy="17" r="1" />
        </>
      )
    case 'settings':
      return (
        <>
          <Circle {...stroke} cx="12" cy="12" r="3" />
          <Path
            {...stroke}
            d="M19 13.5a7.4 7.4 0 0 0 0-3l2-1.2-2-3.4-2.2 1a7.4 7.4 0 0 0-2.6-1.5L14 3h-4l-.3 2.4a7.4 7.4 0 0 0-2.6 1.5l-2.2-1-2 3.4 2 1.2a7.4 7.4 0 0 0 0 3l-2 1.2 2 3.4 2.2-1a7.4 7.4 0 0 0 2.6 1.5L10 21h4l.3-2.4a7.4 7.4 0 0 0 2.6-1.5l2.2 1 2-3.4z"
          />
        </>
      )
    case 'admin-panel-settings':
      return (
        <>
          <Path {...stroke} d="M5 4.5h9v6.2a6.8 6.8 0 0 1-4.5 6.4A6.8 6.8 0 0 1 5 10.7z" />
          <Polyline {...stroke} points="7.5 10 9 11.5 12 8.5" />
          <Circle {...stroke} cx="17.5" cy="16.5" r="3" />
          <Line {...stroke} x1="17.5" x2="17.5" y1="12.2" y2="13.5" />
          <Line {...stroke} x1="17.5" x2="17.5" y1="19.5" y2="20.8" />
          <Line {...stroke} x1="13.2" x2="14.4" y1="16.5" y2="16.5" />
          <Line {...stroke} x1="20.6" x2="21.8" y1="16.5" y2="16.5" />
        </>
      )
    case 'smart-toy':
      return (
        <>
          <Rect {...stroke} height="10" rx="2" width="14" x="5" y="8" />
          <Circle fill={color} cx="9" cy="13" r="1" />
          <Circle fill={color} cx="15" cy="13" r="1" />
          <Line {...stroke} x1="12" x2="12" y1="5" y2="8" />
          <Circle fill={color} cx="12" cy="4" r="1" />
          <Line {...stroke} x1="3" x2="5" y1="11" y2="11" />
          <Line {...stroke} x1="19" x2="21" y1="11" y2="11" />
        </>
      )
    case 'terminal':
      return (
        <>
          <Rect {...stroke} height="14" rx="1.5" width="18" x="3" y="5" />
          <Polyline {...stroke} points="7 9 10 12 7 15" />
          <Line {...stroke} x1="13" x2="17" y1="15" y2="15" />
        </>
      )
    case 'code':
      return (
        <>
          <Polyline {...stroke} points="9 7 4 12 9 17" />
          <Polyline {...stroke} points="15 7 20 12 15 17" />
          <Line {...stroke} x1="13" x2="11" y1="5" y2="19" />
        </>
      )
    case 'edit':
      return (
        <>
          <Path {...stroke} d="M4 16.5V20h3.5L18.8 8.7a2.2 2.2 0 0 0-3.1-3.1z" />
          <Line {...stroke} x1="14" x2="18" y1="7" y2="11" />
        </>
      )
    case 'note-add':
      return (
        <>
          <Path {...stroke} d="M5 3.5h10l4 4V20H5zM15 3.5V8h4" />
          <Line {...stroke} x1="12" x2="12" y1="11" y2="17" />
          <Line {...stroke} x1="9" x2="15" y1="14" y2="14" />
        </>
      )
    case 'language':
    case 'globe':
      return (
        <>
          <Circle {...stroke} cx="12" cy="12" r="8.5" />
          <Path
            {...stroke}
            d="M3.8 12h16.4M12 3.5c2.2 2.3 3.3 5.1 3.3 8.5S14.2 18.2 12 20.5C9.8 18.2 8.7 15.4 8.7 12S9.8 5.8 12 3.5z"
          />
        </>
      )
    case 'build':
      return (
        <>
          <Path {...stroke} d="M14 5a5 5 0 0 0-6.5 6.5L3.5 15.5a2.1 2.1 0 0 0 3 3l4-4A5 5 0 0 0 17 8l-3 3-2-2z" />
          <Circle {...stroke} cx="17.5" cy="17.5" r="3" />
        </>
      )
    case 'connect':
      return (
        <>
          <Circle {...stroke} cx="7" cy="12" r="3" />
          <Circle {...stroke} cx="17" cy="12" r="3" />
          <Line {...stroke} x1="10" x2="14" y1="12" y2="12" />
        </>
      )
    default:
      return <Circle {...stroke} cx="12" cy="12" r="8" />
  }
}
