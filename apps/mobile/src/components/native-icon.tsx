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
  'goal',
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
  'sparkle',
  'stop',
  'think',
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
    case 'goal':
      return (
        <G scale={1.5}>
          <Path
            fill={color}
            d="M8 0C8.31451 0 8.62464 0.019379 8.92969 0.0546875C8.48228 0.403371 8.0952 0.825758 7.78809 1.30469C4.18586 1.41664 1.2998 4.37061 1.2998 8C1.2998 11.7003 4.29969 14.7002 8 14.7002C11.6297 14.7002 14.5829 11.8136 14.6943 8.21094C15.1734 7.90377 15.5956 7.51688 15.9443 7.06934C15.9797 7.37473 16 7.68512 16 8C16 12.4183 12.4183 16 8 16C3.58172 16 0 12.4183 0 8C0 3.58172 3.58172 0 8 0ZM7.0166 3.6084C7.00658 3.73765 7 3.86817 7 4C7 4.31845 7.03098 4.62973 7.08789 4.93164C5.76489 5.32438 4.7998 6.54958 4.7998 8C4.7998 9.76731 6.23269 11.2002 8 11.2002C9.45065 11.2002 10.6749 10.2345 11.0674 8.91113C11.3696 8.96818 11.6812 9 12 9C12.1315 9 12.2617 8.99239 12.3906 8.98242C11.9423 10.995 10.1477 12.5 8 12.5C5.51472 12.5 3.5 10.4853 3.5 8C3.5 5.85255 5.00435 4.05702 7.0166 3.6084Z"
          />
          <Path d="M7.5 8.62109L9.12109 7" stroke={color} strokeWidth="1.3" />
          <Path
            d="M9.08245 3.35798L11.8651 0.575334C11.895 0.545384 11.9463 0.56391 11.9502 0.606086L12.2362 3.69859C12.2384 3.72259 12.2574 3.74159 12.2814 3.74378L15.3697 4.02583C15.4119 4.02968 15.4305 4.08101 15.4005 4.11098L12.618 6.89351C12.6086 6.90289 12.5959 6.90816 12.5826 6.90816L9.11781 6.90815C9.09019 6.90816 9.06781 6.88577 9.06781 6.85816L9.06781 3.39333C9.06781 3.38007 9.07308 3.36735 9.08245 3.35798Z"
            stroke={color}
            strokeWidth="1.3"
          />
        </G>
      )
    case 'think':
      return (
        <G scale={1.5}>
          <Path
            fill={color}
            d="M7.06431 5.93342C7.68763 5.93342 8.19307 6.43904 8.19322 7.06233C8.19322 7.68573 7.68772 8.19123 7.06431 8.19123C6.44099 8.19113 5.9354 7.68567 5.9354 7.06233C5.93555 6.43911 6.44108 5.93353 7.06431 5.93342Z"
          />
          <Path
            fill={color}
            fillRule="evenodd"
            d="M8.6815 0.963693C10.1169 0.447019 11.6266 0.374829 12.5633 1.31135C13.5 2.24805 13.4277 3.75776 12.911 5.19319C12.7126 5.74431 12.4386 6.31796 12.0965 6.89729C12.4969 7.54638 12.8141 8.19018 13.036 8.80647C13.5527 10.2419 13.6251 11.7516 12.6883 12.6883C11.7516 13.625 10.242 13.5527 8.8065 13.036C8.19022 12.8141 7.54641 12.4969 6.89732 12.0965C6.31797 12.4386 5.74435 12.7125 5.19322 12.911C3.75777 13.4276 2.2481 13.5 1.31138 12.5633C0.374859 11.6266 0.447049 10.1168 0.963724 8.68147C1.17185 8.10338 1.46321 7.50063 1.82896 6.8924C1.52182 6.35711 1.27235 5.82825 1.08872 5.31819C0.572068 3.88278 0.499714 2.37306 1.43638 1.43635C2.37308 0.499655 3.8828 0.572044 5.31822 1.08869C5.82828 1.27232 6.35715 1.5218 6.89243 1.82893C7.50066 1.46318 8.10341 1.17181 8.6815 0.963693ZM11.3573 8.01154C10.9083 8.62253 10.3901 9.22873 9.80943 9.8094C9.22877 10.3901 8.62255 10.9083 8.01158 11.3572C8.4257 11.5841 8.8287 11.7688 9.21275 11.9071C10.5456 12.3868 11.4246 12.2547 11.8397 11.8397C12.2548 11.4246 12.3869 10.5456 11.9071 9.21272C11.7688 8.82866 11.5841 8.42568 11.3573 8.01154ZM2.56529 8.02912C2.37344 8.39322 2.21495 8.74796 2.09263 9.08772C1.61291 10.4204 1.74512 11.2995 2.16001 11.7147C2.57505 12.1297 3.45415 12.2618 4.78697 11.7821C5.11057 11.6656 5.44786 11.5164 5.7938 11.3367C5.249 10.9223 4.70922 10.4533 4.19029 9.9344C3.57578 9.31987 3.03169 8.67633 2.56529 8.02912ZM6.90708 3.2469C6.24065 3.70479 5.5646 4.26321 4.91392 4.91389C4.26325 5.56456 3.70482 6.24063 3.24693 6.90705C3.72674 7.63325 4.32777 8.37459 5.03892 9.08576C5.64943 9.69627 6.28183 10.2265 6.90806 10.6678C7.59368 10.2025 8.2908 9.63076 8.96079 8.96076C9.6308 8.29075 10.2025 7.59366 10.6678 6.90803C10.2265 6.2818 9.69631 5.6494 9.08579 5.03889C8.37462 4.32773 7.63328 3.72672 6.90708 3.2469ZM11.7147 2.15998C11.2996 1.74509 10.4204 1.61288 9.08775 2.0926C8.74835 2.21479 8.39382 2.37271 8.03013 2.56428C8.67728 3.03065 9.31995 3.5758 9.93443 4.19026C10.4534 4.7092 10.9223 5.24896 11.3368 5.79377C11.5164 5.44785 11.6656 5.11052 11.7821 4.78694C12.2618 3.45416 12.1297 2.57502 11.7147 2.15998ZM4.91197 2.2176C3.57922 1.73788 2.70004 1.86995 2.28501 2.28498C1.87001 2.70003 1.73791 3.5792 2.21763 4.91194C2.31709 5.18822 2.44112 5.47427 2.58677 5.7674C3.01931 5.1887 3.51474 4.6158 4.06529 4.06526C4.61584 3.5147 5.18872 3.01928 5.76743 2.58674C5.47431 2.4411 5.18824 2.31706 4.91197 2.2176Z"
          />
        </G>
      )
    case 'sparkle':
      return (
        <G scale={1.5}>
          <Path fill={color} d="M6.1 3.1Q6.6 7.8 11.3 8.3Q6.6 8.8 6.1 13.5Q5.6 8.8 0.9 8.3Q5.6 7.8 6.1 3.1Z" />
          <Path fill={color} d="M11.9 1Q12.2 3.7 14.9 4Q12.2 4.3 11.9 7Q11.6 4.3 8.9 4Q11.6 3.7 11.9 1Z" />
          <Path fill={color} d="M12.5 9.4Q12.7 11.4 14.7 11.6Q12.7 11.8 12.5 13.8Q12.3 11.8 10.3 11.6Q12.3 11.4 12.5 9.4Z" />
        </G>
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
