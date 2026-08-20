import type { MobileModelCatalogModel, MobileModelProviderGroup, MobileModelSelection } from '@/types/mobile'
import { NativeSection } from '@/components/native-list'
import { NativeSelectionRow } from '@/components/native-selection'

export type NativeModelSelection = Pick<MobileModelSelection, 'provider' | 'model'>

type NativeModelSelectionGroupProps = {
  group: MobileModelProviderGroup
  selection?: NativeModelSelection
  disabled?: boolean
  submittingKey?: string
  onSelect?: (selection: NativeModelSelection) => void
}

/**
 * Renders one desktop-provider model group using the shared native option rows.
 * @param props - Group catalog, current selection, and optional selection action.
 * @returns A provider-headed native model selection section.
 */
export function NativeModelSelectionGroup({
  group,
  selection,
  disabled = false,
  submittingKey,
  onSelect,
}: NativeModelSelectionGroupProps): React.JSX.Element {
  return (
    <NativeSection title={group.name}>
      {group.models.map((model) => {
        const key = nativeModelSelectionKey(group.id, model.id)
        const selected = selection?.provider === group.id && selection.model === model.id
        return (
          <NativeSelectionRow
            key={model.id}
            accessibilityLabel={`${model.name}${selected ? '，当前模型' : ''}${disabled ? '，不可用' : ''}`}
            description={nativeModelDescription(model)}
            disabled={disabled}
            loading={submittingKey === key}
            onPress={onSelect === undefined ? undefined : () => onSelect({ provider: group.id, model: model.id })}
            selected={selected}
            title={model.name}
          />
        )
      })}
    </NativeSection>
  )
}

/**
 * Creates the stable key shared by model selection and in-flight state.
 * @param provider - Desktop model provider identifier.
 * @param model - Provider-local model identifier.
 * @returns A unique native selection key.
 */
export function nativeModelSelectionKey(provider: string, model: string): string {
  return `${provider}:${model}`
}

/**
 * Omits a duplicate technical identifier while retaining a distinct model description.
 * @param model - Desktop model catalog entry.
 * @returns The readable secondary model text when it differs from the model name.
 */
export function nativeModelDescription(model: MobileModelCatalogModel): string | undefined {
  const detail = model.description?.trim() || model.id
  const normalizedDetail = detail.replace(/[^a-z0-9]/gi, '').toLowerCase()
  const normalizedName = model.name.replace(/[^a-z0-9]/gi, '').toLowerCase()
  return normalizedDetail === normalizedName ? undefined : detail
}
